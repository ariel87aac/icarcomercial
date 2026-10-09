import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CustomerType } from '../customers/entities/customer.enums';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { InventoryReservationStatus } from '../inventory/entities/inventory.enums';
import { Stock } from '../inventory/entities/stock.entity';
import { PricingService } from '../pricing/pricing.service';
import { UserType } from '../users/entities/user-type.enum';
import { TrackingService } from '../tracking/tracking.service';
import {
  CreateOrderDto,
  OrderItemDto,
  OrderQueryDto,
  ReturnOrderDto,
  TransitionOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrderDetail } from './entities/order-detail.entity';
import { OrderHistory } from './entities/order-history.entity';
import { Order } from './entities/order.entity';
import { OrderOrigin, OrderStatus } from './entities/order.enums';

interface ResolvedItem {
  presentation: ProductPresentation;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderDetail) private readonly detailRepository: Repository<OrderDetail>,
    @InjectRepository(OrderHistory) private readonly historyRepository: Repository<OrderHistory>,
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress) private readonly addressRepository: Repository<CustomerAddress>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    private readonly pricingService: PricingService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly trackingService: TrackingService,
  ) {}

  async findAll(query: OrderQueryDto, actor: AuthenticatedUser) {
    const builder = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.createdBy', 'createdBy')
      .leftJoinAndSelect('order.confirmedBy', 'confirmedBy')
      .loadRelationCountAndMap('order.detailCount', 'order.details')
      .orderBy('order.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (actor.type === UserType.CUSTOMER) {
      builder.andWhere('order.customerId = :scopedCustomerId', { scopedCustomerId: actor.customerId });
    } else if (query.customerId) {
      builder.andWhere('order.customerId = :customerId', { customerId: query.customerId });
    }
    if (query.q) {
      builder.andWhere(new Brackets((where) => where
        .where('order.code ILIKE :q', { q: `%${query.q}%` })
        .orWhere('unaccent(customer.businessName) ILIKE unaccent(:q)', { q: `%${query.q}%` })));
    }
    if (query.status) builder.andWhere('order.status = :status', { status: query.status });
    if (query.from) builder.andWhere('order.requestedDate >= :from', { from: query.from });
    if (query.to) builder.andWhere('order.requestedDate <= :to', { to: query.to });
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Order> {
    const order = await this.loadOrder(id);
    await this.assertScope(order, actor);
    return order;
  }

  async create(dto: CreateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : dto.customerId;
    if (!customerId) throw new BadRequestException('Debe seleccionar un cliente');
    const origin = this.origin(actor);
    const { customer, address, items } = await this.validateOrder(
      customerId,
      dto.addressId,
      dto.requestedDate,
      dto.details,
    );
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const orderId = await this.dataSource.transaction(async (manager) => {
      const sequence = await manager.query<{ nextval: string }[]>(`SELECT nextval('pedidos_codigo_seq')::text AS nextval`);
      const code = `PED-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${sequence[0].nextval.padStart(6, '0')}`;
      const order = await manager.getRepository(Order).save(manager.getRepository(Order).create({
        code,
        customerId: customer.id,
        addressId: address.id,
        requestedDate: dto.requestedDate,
        status: OrderStatus.DRAFT,
        origin,
        observations: dto.observations?.trim() || null,
        total: total.toFixed(2),
        createdById: actor.id,
        confirmedById: null,
        receivedAt: null,
        confirmedAt: null,
        customerNameSnapshot: null,
        customerTypeSnapshot: null,
        commercialListSnapshot: null,
        addressSnapshot: null,
        zoneSnapshot: null,
        distributionWeekdaySnapshot: null,
      }));
      await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, order.id, item)));
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: order.id,
        previousStatus: null,
        newStatus: OrderStatus.DRAFT,
        userId: actor.id,
        origin,
        observation: 'Pedido registrado',
      }));
      return order.id;
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'CREAR_PEDIDO',
      entity: 'pedidos',
      entityId: orderId,
      result: 'EXITOSO',
      metadata: { customerId, origin },
    });
    return this.findOne(orderId, actor);
  }

  async update(id: string, dto: UpdateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.findOne(id, actor);
    if (current.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
    if (actor.type === UserType.CUSTOMER && current.status !== OrderStatus.DRAFT) {
      throw new ConflictException('El cliente solo puede modificar pedidos en Borrador');
    }
    const itemsDto = dto.details ?? current.details.map((detail) => ({
      presentationId: detail.presentationId,
      quantity: Number(detail.requestedQuantity),
    }));
    const addressId = dto.addressId ?? current.addressId;
    const requestedDate = dto.requestedDate ?? current.requestedDate;
    const { items } = await this.validateOrder(current.customerId, addressId, requestedDate, itemsDto);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (order.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
      order.addressId = addressId;
      order.requestedDate = requestedDate;
      if (dto.observations !== undefined) order.observations = dto.observations.trim() || null;
      order.total = total.toFixed(2);
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderDetail).delete({ orderId: id });
      await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, id, item)));
    });
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'ACTUALIZAR_PEDIDO',
      entity: 'pedidos',
      entityId: id,
      result: 'EXITOSO',
      metadata: { fields: Object.keys(dto), status: current.status },
    });
    return this.findOne(id, actor);
  }

  async send(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.findOne(id, actor);
    if (current.status !== OrderStatus.DRAFT) throw new ConflictException('Solo un pedido en Borrador puede enviarse');
    const itemsDto = current.details.map((detail) => ({ presentationId: detail.presentationId, quantity: Number(detail.requestedQuantity) }));
    const { items } = await this.validateOrder(current.customerId, current.addressId, current.requestedDate, itemsDto);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order').setLock('pessimistic_write').where('order.id = :id', { id }).getOneOrFail();
      if (order.status !== OrderStatus.DRAFT) throw new ConflictException('El pedido ya cambió de estado');
      order.status = OrderStatus.RECEIVED;
      order.receivedAt = new Date();
      order.total = total.toFixed(2);
      await manager.getRepository(Order).save(order);
      for (const item of items) {
        await manager.getRepository(OrderDetail).update(
          { orderId: id, presentationId: item.presentation.id },
          this.detailValues(item),
        );
      }
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus: OrderStatus.DRAFT,
        newStatus: OrderStatus.RECEIVED,
        userId: actor.id,
        origin: this.origin(actor),
        observation: dto.observation?.trim() || 'Pedido enviado para revisión',
      }));
    });
    await this.auditService.record({ userId: actor.id, module: 'orders', action: 'ENVIAR_PEDIDO', entity: 'pedidos', entityId: id, result: 'EXITOSO' });
    return this.findOne(id, actor);
  }

  async returnToDraft(id: string, dto: ReturnOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    const current = await this.findOne(id, actor);
    if (current.status !== OrderStatus.RECEIVED) throw new ConflictException('Solo un pedido Recibido puede devolverse');
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order').setLock('pessimistic_write').where('order.id = :id', { id }).getOneOrFail();
      if (order.status !== OrderStatus.RECEIVED) throw new ConflictException('El pedido ya cambió de estado');
      order.status = OrderStatus.DRAFT;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus: OrderStatus.RECEIVED,
        newStatus: OrderStatus.DRAFT,
        userId: actor.id,
        origin: OrderOrigin.INTERNAL,
        observation: dto.observation.trim(),
      }));
    });
    await this.auditService.record({ userId: actor.id, module: 'orders', action: 'DEVOLVER_PEDIDO', entity: 'pedidos', entityId: id, result: 'EXITOSO', metadata: { observation: dto.observation } });
    return this.findOne(id, actor);
  }

  async confirm(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status !== OrderStatus.RECEIVED) throw new ConflictException('Solo un pedido Recibido puede confirmarse');
      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id }, order: { presentationId: 'ASC' } });
      const { customer, address, items } = await this.validateOrder(
        order.customerId,
        order.addressId,
        order.requestedDate,
        details.map((detail) => ({ presentationId: detail.presentationId, quantity: Number(detail.requestedQuantity) })),
        manager,
      );
      let total = 0;
      for (const item of [...items].sort((a, b) => a.presentation.id.localeCompare(b.presentation.id))) {
        await manager.query(
          `INSERT INTO existencias (presentacion_id, cantidad_fisica, cantidad_reservada)
           VALUES ($1, 0, 0) ON CONFLICT (presentacion_id) DO NOTHING`,
          [item.presentation.id],
        );
        const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.presentationId = :presentationId', { presentationId: item.presentation.id })
          .getOneOrFail();
        const available = Math.max(0, Number(stock.physicalQuantity) - Number(stock.reservedQuantity));
        const reserved = Math.min(item.quantity, available);
        const pending = item.quantity - reserved;
        stock.reservedQuantity = (Number(stock.reservedQuantity) + reserved).toFixed(3);
        if (Number(stock.reservedQuantity) > Number(stock.physicalQuantity)) {
          throw new ConflictException('Conflicto de concurrencia al reservar inventario');
        }
        await manager.getRepository(Stock).save(stock);
        const detail = details.find((value) => value.presentationId === item.presentation.id)!;
        Object.assign(detail, this.detailValues(item), {
          reservedQuantity: reserved.toFixed(3),
          pendingQuantity: pending.toFixed(3),
        });
        await manager.getRepository(OrderDetail).save(detail);
        await manager.getRepository(InventoryReservation).save(manager.getRepository(InventoryReservation).create({
          orderDetailId: detail.id,
          stockId: stock.id,
          quantity: reserved.toFixed(3),
          status: InventoryReservationStatus.ACTIVE,
          userId: actor.id,
        }));
        total += item.subtotal;
      }
      order.status = OrderStatus.CONFIRMED;
      order.confirmedById = actor.id;
      order.confirmedAt = new Date();
      order.total = total.toFixed(2);
      order.customerNameSnapshot = customer.businessName;
      order.customerTypeSnapshot = customer.type;
      order.commercialListSnapshot = customer.commercialList;
      order.addressSnapshot = address.address;
      order.zoneSnapshot = address.zone?.name ?? null;
      order.distributionWeekdaySnapshot = address.distributionDay?.weekday ?? null;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus: OrderStatus.RECEIVED,
        newStatus: OrderStatus.CONFIRMED,
        userId: actor.id,
        origin: OrderOrigin.INTERNAL,
        observation: dto.observation?.trim() || 'Pedido confirmado y reservado',
      }));
      await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
        userId: actor.id,
        module: 'orders',
        action: 'CONFIRMAR_PEDIDO',
        entity: 'pedidos',
        entityId: id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: { customerId: customer.id, total: total.toFixed(2) },
      }));
    });
    await this.trackingService.safeCaptureOrder(id, `order.confirmed:${id}`);
    return this.findOne(id, actor);
  }

  async history(id: string, actor: AuthenticatedUser): Promise<OrderHistory[]> {
    await this.findOne(id, actor);
    return this.historyRepository.find({ where: { orderId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }

  private async validateOrder(
    customerId: string,
    addressId: string,
    requestedDate: string,
    details: OrderItemDto[],
    manager?: EntityManager,
  ): Promise<{ customer: Customer; address: CustomerAddress; items: ResolvedItem[] }> {
    const customerRepository = manager?.getRepository(Customer) ?? this.customerRepository;
    const addressRepository = manager?.getRepository(CustomerAddress) ?? this.addressRepository;
    const presentationRepository = manager?.getRepository(ProductPresentation) ?? this.presentationRepository;
    const customer = await customerRepository.findOne({ where: { id: customerId, status: RecordStatus.ACTIVE } });
    if (!customer) throw new NotFoundException('Cliente no encontrado o inactivo');
    const address = await addressRepository.findOne({
      where: { id: addressId, customerId, status: RecordStatus.ACTIVE },
      relations: { zone: true, distributionDay: true },
    });
    if (!address) throw new UnprocessableEntityException('El domicilio no pertenece al cliente o está inactivo');
    this.validateRequestedDate(customer.type, address, requestedDate);
    if (!details.length) throw new BadRequestException('El pedido debe incluir al menos un detalle');
    const uniqueIds = new Set(details.map((detail) => detail.presentationId));
    if (uniqueIds.size !== details.length) throw new BadRequestException('Una presentación no puede repetirse en el detalle');
    const today = new Date().toISOString().slice(0, 10);
    const items: ResolvedItem[] = [];
    for (const detail of details) {
      const presentation = await presentationRepository.findOne({
        where: { id: detail.presentationId, status: RecordStatus.ACTIVE },
        relations: { product: true, unit: true },
      });
      if (!presentation || presentation.product.status !== RecordStatus.ACTIVE) {
        throw new UnprocessableEntityException('El pedido contiene un producto o presentación inactiva');
      }
      const price = await this.pricingService.resolveApplicablePrice(presentation.id, customer, today, manager);
      if (!price) throw new UnprocessableEntityException(`No existe un precio aplicable para ${presentation.description}`);
      const unitPrice = Number(price.amount);
      items.push({ presentation, quantity: detail.quantity, unitPrice, subtotal: unitPrice * detail.quantity });
    }
    return { customer, address, items };
  }

  private validateRequestedDate(customerType: CustomerType, address: CustomerAddress, requestedDate: string): void {
    if (!address.zone || address.zone.status !== RecordStatus.ACTIVE || !address.distributionDay || address.distributionDay.status !== RecordStatus.ACTIVE) {
      throw new UnprocessableEntityException('El domicilio debe tener una zona y un día de distribución activos');
    }
    if (address.distributionDay.zoneId !== address.zone.id) {
      throw new UnprocessableEntityException('El día de distribución no pertenece a la zona del domicilio');
    }
    const requested = new Date(`${requestedDate}T00:00:00.000Z`);
    if (Number.isNaN(requested.getTime())) throw new BadRequestException('La fecha solicitada no es válida');
    const weekday = requested.getUTCDay() === 0 ? 7 : requested.getUTCDay();
    if (weekday !== address.distributionDay.weekday) {
      throw new UnprocessableEntityException(`La fecha solicitada debe corresponder al día ${address.distributionDay.weekday} configurado para el domicilio`);
    }
    const now = Date.now();
    if (requested.getTime() < new Date().setUTCHours(0, 0, 0, 0)) {
      throw new UnprocessableEntityException('La fecha solicitada no puede estar en el pasado');
    }
    if ([CustomerType.DISTRIBUTOR, CustomerType.WHOLESALE].includes(customerType) && requested.getTime() - now < 24 * 60 * 60 * 1000) {
      throw new UnprocessableEntityException('Distribuidores y mayoristas requieren al menos 24 horas de anticipación');
    }
  }

  private detailEntity(manager: EntityManager, orderId: string, item: ResolvedItem): OrderDetail {
    return manager.getRepository(OrderDetail).create({ orderId, presentationId: item.presentation.id, ...this.detailValues(item) });
  }

  private detailValues(item: ResolvedItem): Partial<OrderDetail> {
    return {
      requestedQuantity: item.quantity.toFixed(3),
      reservedQuantity: '0.000',
      pendingQuantity: '0.000',
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.subtotal.toFixed(2),
      productDescriptionSnapshot: item.presentation.product.name,
      presentationDescriptionSnapshot: item.presentation.description,
      unitAbbreviationSnapshot: item.presentation.unit.abbreviation,
    };
  }

  private async loadOrder(id: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: {
        customer: true,
        address: { zone: true, distributionDay: true },
        createdBy: true,
        confirmedBy: true,
        details: { presentation: { product: true, unit: true } },
      },
      order: { details: { createdAt: 'ASC' } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private async assertScope(order: Order, actor: AuthenticatedUser): Promise<void> {
    if (actor.type !== UserType.CUSTOMER || order.customerId === actor.customerId) return;
    await this.auditService.record({
      userId: actor.id,
      module: 'orders',
      action: 'ACCESO_PEDIDO_AJENO',
      entity: 'pedidos',
      entityId: order.id,
      result: 'RECHAZADO',
      metadata: { scopedCustomerId: actor.customerId },
    });
    throw new NotFoundException('Pedido no encontrado');
  }

  private origin(actor: AuthenticatedUser): OrderOrigin {
    return actor.type === UserType.CUSTOMER ? OrderOrigin.PORTAL : OrderOrigin.INTERNAL;
  }
}
