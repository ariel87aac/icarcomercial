import { workflowTransaction } from './order-workflow';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { attachOrderWorkflow } from './order-workflow';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { AuditService } from '../audit/audit.service';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { CustomerAddress } from '../customers/entities/customer-address.entity';
import { Customer } from '../customers/entities/customer.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { InventoryReservationStatus } from '../inventory/entities/inventory.enums';
import { Stock } from '../inventory/entities/stock.entity';
import { PricingService } from '../pricing/pricing.service';
import { UserType } from '../users/entities/user-type.enum';
import { TrackingService } from '../tracking/tracking.service';
import { NotificationService } from '../tracking/notification.service';
import { NotificationEvent } from '../tracking/entities/tracking.enums';
import {
  CancelOrderDto,
  CreateOrderDto,
  DeleteOrderDto,
  OrderItemDto,
  OrderQueryDto,
  ReturnOrderDto,
  TransitionOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { OrderDetail } from './entities/order-detail.entity';
import { OrderConfirmationLink } from './entities/order-confirmation-link.entity';
import { OrderHistory } from './entities/order-history.entity';
import { Order } from './entities/order.entity';
import { OrderConfirmationLinkStatus, OrderOrigin, OrderStatus } from './entities/order.enums';
import { OrderScheduleWindow, OrderSchedulingService } from './order-scheduling.service';

interface ResolvedItem {
  presentation: ProductPresentation;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface PublicOrderConfirmationView {
  trackingUrl?: string;
  orderReference: string;
  customerName: string;
  requestedDate: string;
  orderCutoffAt: Date;
  status: OrderStatus;
  total: string;
  canConfirm: boolean;
  details: Array<{
    product: string;
    presentation: string;
    unit: string;
    quantity: string;
    subtotal: string;
  }>;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderDetail) private readonly detailRepository: Repository<OrderDetail>,
    @InjectRepository(OrderHistory) private readonly historyRepository: Repository<OrderHistory>,
    @InjectRepository(OrderConfirmationLink)
    private readonly confirmationLinkRepository: Repository<OrderConfirmationLink>,
    @InjectRepository(Customer) private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAddress) private readonly addressRepository: Repository<CustomerAddress>,
    @InjectRepository(ProductPresentation)
    private readonly presentationRepository: Repository<ProductPresentation>,
    private readonly pricingService: PricingService,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly trackingService: TrackingService,
    private readonly notificationService: NotificationService,
    private readonly schedulingService: OrderSchedulingService,
    private readonly config: ConfigService,
  ) {}

  async findAll(query: OrderQueryDto, actor: AuthenticatedUser) {
    const builder = this.orderRepository.createQueryBuilder('order')
      .leftJoinAndSelect('order.customer', 'customer')
      .leftJoinAndSelect('order.address', 'address')
      .leftJoinAndSelect('order.createdBy', 'createdBy')
      .leftJoinAndSelect('order.confirmedBy', 'confirmedBy')
      .leftJoinAndSelect('order.canceledBy', 'canceledBy')
      .loadRelationCountAndMap('order.detailCount', 'order.details')
      .addSelect('CAST("order"."codigo" AS bigint)', 'order_numeric_code')
      .orderBy('order_numeric_code', 'DESC')
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
    return paginate(await attachOrderWorkflow(this.dataSource.manager, data), total, query.page, query.limit);
  }

  async statusSummary(actor: AuthenticatedUser): Promise<Record<OrderStatus, number>> {
    const builder = this.orderRepository.createQueryBuilder('order')
      .select('order.status', 'status')
      .addSelect('COUNT(order.id)', 'count')
      .groupBy('order.status');
    if (actor.type === UserType.CUSTOMER) {
      builder.where('order.customerId = :customerId', { customerId: actor.customerId });
    }
    const rows = await builder.getRawMany<{ status: OrderStatus; count: string }>();
    const summary: Record<OrderStatus, number> = {
      [OrderStatus.DRAFT]: 0,
      [OrderStatus.RECEIVED]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.CANCELED]: 0,
    };
    for (const row of rows) summary[row.status] = Number(row.count);
    return summary;
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<Order> {
    const order = await this.loadOrder(id);
    await this.assertScope(order, actor);
    await attachOrderWorkflow(this.dataSource.manager, [order]);
    return order;
  }

  async create(dto: CreateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const customerId = actor.type === UserType.CUSTOMER ? actor.customerId : dto.customerId;
    if (!customerId) throw new BadRequestException('Debe seleccionar un cliente');
    const origin = this.origin(actor);
    const { customer, address, items, schedule } = await this.validateOrder(
      customerId,
      dto.addressId,
      dto.requestedDate,
      dto.details,
    );
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    const rawConfirmationToken = randomBytes(32).toString('base64url');
    const orderId = await workflowTransaction(this.dataSource, async (manager) => {
      const sequence = await manager.query<{ nextval: string }[]>(`SELECT nextval('pedidos_codigo_seq')::text AS nextval`);
      const code = sequence[0].nextval;
      const order = await manager.getRepository(Order).save(manager.getRepository(Order).create({
        code,
        customerId: customer.id,
        addressId: address.id,
        requestedDate: dto.requestedDate,
        orderCutoffAt: schedule.orderCutoffAt,
        preparationAt: schedule.preparationAt,
        status: OrderStatus.DRAFT,
        origin,
        observations: dto.observations?.trim() || null,
        total: total.toFixed(2),
        createdById: actor.id,
        confirmedById: null,
        canceledById: null,
        receivedAt: null,
        confirmedAt: null,
        canceledAt: null,
        cancellationReason: null,
        customerNameSnapshot: null,
        customerTypeSnapshot: null,
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
      await manager.getRepository(OrderConfirmationLink).save(manager.getRepository(OrderConfirmationLink).create({
        orderId: order.id,
        tokenHash: this.hashToken(rawConfirmationToken),
        status: OrderConfirmationLinkStatus.ACTIVE,
        expiresAt: schedule.orderCutoffAt,
        createdById: actor.id,
        usedAt: null,
        revokedAt: null,
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
    const created = await this.findOne(orderId, actor);
    const trackingUrl = await this.trackingService.ensureOrderLink(created);
    await this.trackingService.safeCaptureOrder(orderId, `order.created:${orderId}`, false);
    await this.notificationService.safeEnqueueOrderLifecycle(
      created,
      NotificationEvent.ORDER_DRAFT,
      actor.id,
      {
        trackingUrl,
        confirmationUrl: `${this.publicBaseUrl()}/confirmar-pedido/${rawConfirmationToken}`,
        productList: this.productList(created),
      },
    );
    return created;
  }

  async update(id: string, dto: UpdateOrderDto, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.findOne(id, actor);
    if (current.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
    if (current.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
    if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status)) throw new ConflictException('El pedido no admite cambios');
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    const itemsDto = dto.details ?? current.details.map((detail) => ({
      presentationId: detail.presentationId,
      quantity: Number(detail.requestedQuantity),
    }));
    const addressId = dto.addressId ?? current.addressId;
    const requestedDate = dto.requestedDate ?? current.requestedDate;
    const scheduleChanged = addressId !== current.addressId || requestedDate !== current.requestedDate;
    const { items, schedule } = await this.validateOrder(current.customerId, addressId, requestedDate, itemsDto, undefined, scheduleChanged);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (order.status === OrderStatus.CONFIRMED) throw new ConflictException('Un pedido confirmado es inmutable');
      if (order.status === OrderStatus.CANCELED) throw new ConflictException('Un pedido cancelado es inmutable');
      order.addressId = addressId;
      order.requestedDate = requestedDate;
      if (scheduleChanged) {
        order.orderCutoffAt = schedule.orderCutoffAt;
        order.preparationAt = schedule.preparationAt;
        await manager.getRepository(OrderConfirmationLink).update(
          { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
          { expiresAt: schedule.orderCutoffAt },
        );
      }
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
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    const itemsDto = current.details.map((detail) => ({ presentationId: detail.presentationId, quantity: Number(detail.requestedQuantity) }));
    const { items } = await this.validateOrder(current.customerId, current.addressId, current.requestedDate, itemsDto, undefined, false);
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    await workflowTransaction(this.dataSource, async (manager) => {
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
    const received = await this.findOne(id, actor);
    await this.trackingService.safeCaptureOrder(id, `order.received:${id}:${received.updatedAt.getTime()}`, false);
    await this.notificationService.safeEnqueueOrderLifecycle(
      received,
      NotificationEvent.ORDER_RECEIVED,
      actor.id,
      { productList: this.productList(received), trackingUrl: await this.trackingService.ensureOrderLink(received) },
    );
    return received;
  }

  async returnToDraft(id: string, dto: ReturnOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    const current = await this.findOne(id, actor);
    if (current.status !== OrderStatus.RECEIVED) throw new ConflictException('Solo un pedido Recibido puede devolverse');
    this.schedulingService.assertOrderOpen(current.orderCutoffAt);
    await workflowTransaction(this.dataSource, async (manager) => {
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
    await this.trackingService.safeCaptureOrder(id, `order.returned:${id}:${Date.now()}`, false);
    return this.findOne(id, actor);
  }

  async confirm(id: string, dto: TransitionOrderDto, actor: AuthenticatedUser): Promise<Order> {
    if (actor.type === UserType.CUSTOMER) throw new NotFoundException('Pedido no encontrado');
    await this.confirmOrder(id, {
      actorId: actor.id,
      reservationUserId: actor.id,
      allowedStatuses: [OrderStatus.RECEIVED],
      origin: OrderOrigin.INTERNAL,
      observation: dto.observation?.trim() || 'Pedido confirmado y reservado',
      action: 'CONFIRMAR_PEDIDO',
    });
    const confirmed = await this.findOne(id, actor);
    await this.afterConfirmation(confirmed, actor.id, `order.confirmed:${id}`);
    return confirmed;
  }

  async publicConfirmation(token: string): Promise<PublicOrderConfirmationView> {
    const link = await this.resolveConfirmationLink(token, true);
    const order = await this.loadOrder(link.orderId);
    return { ...this.publicConfirmationView(order, link.status === OrderConfirmationLinkStatus.ACTIVE), trackingUrl: await this.trackingService.ensureOrderLink(order) };
  }

  async confirmPublic(token: string): Promise<PublicOrderConfirmationView> {
    const tokenHash = this.hashToken(token);
    const currentLink = await this.resolveConfirmationLink(token, false);
    const order = await this.loadOrder(currentLink.orderId);
    await this.confirmOrder(order.id, {
      actorId: null,
      reservationUserId: order.createdById,
      allowedStatuses: [OrderStatus.DRAFT, OrderStatus.RECEIVED],
      origin: OrderOrigin.PORTAL,
      observation: 'Pedido confirmado por el cliente mediante enlace seguro',
      action: 'CONFIRMAR_PEDIDO_CLIENTE',
      confirmationTokenHash: tokenHash,
    });
    const confirmed = await this.loadOrder(order.id);
    await this.afterConfirmation(confirmed, order.createdById, `order.confirmed.public:${order.id}`);
    return { ...this.publicConfirmationView(confirmed, false), trackingUrl: await this.trackingService.ensureOrderLink(confirmed) };
  }

  private async confirmOrder(id: string, input: {
    actorId: string | null;
    reservationUserId: string;
    allowedStatuses: OrderStatus[];
    origin: OrderOrigin;
    observation: string;
    action: string;
    confirmationTokenHash?: string;
  }): Promise<void> {
    await workflowTransaction(this.dataSource, async (manager) => {
      let confirmationLink: OrderConfirmationLink | null = null;
      if (input.confirmationTokenHash) {
        confirmationLink = await manager.getRepository(OrderConfirmationLink).createQueryBuilder('link')
          .setLock('pessimistic_write')
          .where('link.tokenHash = :tokenHash', { tokenHash: input.confirmationTokenHash })
          .getOne();
        if (!confirmationLink || confirmationLink.orderId !== id || confirmationLink.status !== OrderConfirmationLinkStatus.ACTIVE) {
          throw new NotFoundException('El enlace de confirmación no está disponible');
        }
        if (confirmationLink.expiresAt <= new Date()) {
          confirmationLink.status = OrderConfirmationLinkStatus.EXPIRED;
          await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
          throw new ConflictException('El plazo de confirmación del pedido finalizó');
        }
      }
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (!input.allowedStatuses.includes(order.status)) {
        throw new ConflictException(input.confirmationTokenHash
          ? 'El pedido ya no puede confirmarse mediante este enlace'
          : 'Solo un pedido Recibido puede confirmarse');
      }
      const previousStatus = order.status;
      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id }, order: { presentationId: 'ASC' } });
      const { customer, address, items, schedule } = await this.validateOrder(
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
        stock.reservedQuantity = (Number(stock.reservedQuantity) + item.quantity).toFixed(3);
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
          quantity: item.quantity.toFixed(3),
          status: InventoryReservationStatus.ACTIVE,
          userId: input.reservationUserId,
        }));
        total += item.subtotal;
      }
      order.status = OrderStatus.CONFIRMED;
      order.confirmedById = input.actorId;
      order.confirmedAt = new Date();
      order.total = total.toFixed(2);
      order.customerNameSnapshot = customer.businessName;
      order.customerTypeSnapshot = customer.type;
      order.addressSnapshot = address.address;
      order.zoneSnapshot = address.zone?.name ?? null;
      order.distributionWeekdaySnapshot = schedule.weekday;
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus,
        newStatus: OrderStatus.CONFIRMED,
        userId: input.actorId,
        origin: input.origin,
        observation: input.observation,
      }));
      if (confirmationLink) {
        confirmationLink.status = OrderConfirmationLinkStatus.USED;
        confirmationLink.usedAt = new Date();
        await manager.getRepository(OrderConfirmationLink).save(confirmationLink);
      } else {
        await manager.getRepository(OrderConfirmationLink).update(
          { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
          { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
        );
      }
      await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
        userId: input.actorId,
        module: 'orders',
        action: input.action,
        entity: 'pedidos',
        entityId: id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: { customerId: customer.id, total: total.toFixed(2), origin: input.origin },
      }));
    });
  }

  async rescheduleToNextAvailable(id: string, actor: AuthenticatedUser): Promise<Order> {
    const current = await this.findOne(id, actor);
    if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(current.status)) {
      throw new ConflictException('Solo un pedido en Borrador o Recibido puede reprogramarse');
    }
    if (new Date(current.orderCutoffAt).getTime() > Date.now()) {
      throw new ConflictException('El pedido todavía se encuentra dentro de su plazo de modificación');
    }

    const nextWindow = (await this.schedulingService.deliveryOptions(current.addressId, current.customerId, actor))
      .find((option) => option.deliveryDate > current.requestedDate);
    if (!nextWindow) {
      throw new UnprocessableEntityException('No existe una siguiente fecha de entrega disponible para la zona del pedido');
    }

    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOneOrFail();
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(order.status)) {
        throw new ConflictException('El pedido ya no admite reprogramación');
      }
      if (new Date(order.orderCutoffAt).getTime() > Date.now()) {
        throw new ConflictException('El pedido ya fue reprogramado o todavía se encuentra dentro del plazo');
      }

      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: id } });
      const previousRequestedDate = order.requestedDate;
      const { items, schedule } = await this.validateOrder(
        order.customerId,
        order.addressId,
        nextWindow.deliveryDate,
        details.map((detail) => ({
          presentationId: detail.presentationId,
          quantity: Number(detail.requestedQuantity),
        })),
        manager,
      );
      const total = items.reduce((sum, item) => sum + item.subtotal, 0);

      order.requestedDate = nextWindow.deliveryDate;
      order.orderCutoffAt = schedule.orderCutoffAt;
      order.preparationAt = schedule.preparationAt;
      order.total = total.toFixed(2);
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderConfirmationLink).update(
        { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
        { expiresAt: schedule.orderCutoffAt },
      );
      await manager.getRepository(OrderDetail).delete({ orderId: id });
      await manager.getRepository(OrderDetail).save(items.map((item) => this.detailEntity(manager, id, item)));
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus: order.status,
        newStatus: order.status,
        userId: actor.id,
        origin: this.origin(actor),
        observation: `Pedido reprogramado de ${previousRequestedDate} a ${nextWindow.deliveryDate} por cierre vencido`,
      }));
      await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
        userId: actor.id,
        module: 'orders',
        action: 'REPROGRAMAR_PEDIDO_SIGUIENTE_FECHA',
        entity: 'pedidos',
        entityId: id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: {
          previousRequestedDate,
          requestedDate: nextWindow.deliveryDate,
          orderCutoffAt: schedule.orderCutoffAt,
          preparationAt: schedule.preparationAt,
        },
      }));
    });
    return this.findOne(id, actor);
  }

  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser): Promise<Order> {
    await this.findOne(id, actor);
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status === OrderStatus.CANCELED) throw new ConflictException('El pedido ya está cancelado');
      if (![OrderStatus.DRAFT, OrderStatus.RECEIVED, OrderStatus.CONFIRMED].includes(order.status)) {
        throw new ConflictException('El pedido no puede cancelarse en su estado actual');
      }
      const previousStatus = order.status;
      let releasedQuantity = 0;
      if (previousStatus === OrderStatus.CONFIRMED) {
        const downstream = await manager.query<Array<{ has_preparation: boolean; has_delivery: boolean; has_sale: boolean }>>(`
          SELECT
            EXISTS (SELECT 1 FROM preparaciones_pedido WHERE pedido_id = $1) AS has_preparation,
            EXISTS (SELECT 1 FROM rutas_entregas WHERE pedido_id = $1) AS has_delivery,
            EXISTS (SELECT 1 FROM ventas WHERE pedido_id = $1) AS has_sale
        `, [id]);
        if (downstream[0]?.has_preparation || downstream[0]?.has_delivery || downstream[0]?.has_sale) {
          throw new ConflictException('El pedido ya tiene preparación, entrega o venta asociada y no puede cancelarse desde Pedidos');
        }

        const reservations = await manager.getRepository(InventoryReservation).createQueryBuilder('reservation')
          .innerJoin(OrderDetail, 'detail', 'detail.id = reservation.orderDetailId')
          .setLock('pessimistic_write')
          .where('detail.orderId = :id', { id })
          .orderBy('reservation.stockId', 'ASC')
          .getMany();
        if (reservations.some((reservation) => reservation.status === InventoryReservationStatus.CONSUMED)) {
          throw new ConflictException('El pedido tiene inventario despachado y no puede cancelarse desde Pedidos');
        }
        if (reservations.some((reservation) => reservation.status !== InventoryReservationStatus.ACTIVE)) {
          throw new ConflictException('Las reservas del pedido ya no se encuentran disponibles para liberación');
        }
        for (const reservation of reservations) {
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
            .setLock('pessimistic_write')
            .where('stock.id = :id', { id: reservation.stockId })
            .getOneOrFail();
          const quantity = Number(reservation.quantity);
          const nextReserved = Number(stock.reservedQuantity) - quantity;
          if (nextReserved < -0.0005) throw new ConflictException('El saldo reservado cambió durante la cancelación');
          stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
          await manager.getRepository(Stock).save(stock);
          reservation.status = InventoryReservationStatus.RELEASED;
          await manager.getRepository(InventoryReservation).save(reservation);
          releasedQuantity += quantity;
        }
        await manager.getRepository(OrderDetail).update({ orderId: id }, { reservedQuantity: '0.000', pendingQuantity: '0.000' });
      }

      order.status = OrderStatus.CANCELED;
      order.canceledById = actor.id;
      order.canceledAt = new Date();
      order.cancellationReason = dto.reason.trim();
      await manager.getRepository(Order).save(order);
      await manager.getRepository(OrderHistory).save(manager.getRepository(OrderHistory).create({
        orderId: id,
        previousStatus,
        newStatus: OrderStatus.CANCELED,
        userId: actor.id,
        origin: this.origin(actor),
        observation: order.cancellationReason,
      }));
      await manager.getRepository(OrderConfirmationLink).update(
        { orderId: id, status: OrderConfirmationLinkStatus.ACTIVE },
        { status: OrderConfirmationLinkStatus.REVOKED, revokedAt: new Date() },
      );
      await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
        userId: actor.id,
        module: 'orders',
        action: 'CANCELAR_PEDIDO',
        entity: 'pedidos',
        entityId: id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: { previousStatus, reason: order.cancellationReason, releasedQuantity: releasedQuantity.toFixed(3) },
      }));
    });
    const canceled = await this.findOne(id, actor);
    await this.trackingService.safeCaptureOrder(id, `order.canceled:${id}`, false);
    await this.trackingService.refreshStock(`stock.cancel:${id}`);
    await this.notificationService.safeEnqueueOrderLifecycle(
      canceled,
      NotificationEvent.ORDER_CANCELED,
      actor.id,
      {
        trackingUrl: await this.trackingService.ensureOrderLink(canceled),
        productList: this.productList(canceled),
        cancellationReason: canceled.cancellationReason ?? dto.reason.trim(),
      },
    );
    return canceled;
  }

  async remove(id: string, dto: DeleteOrderDto, actor: AuthenticatedUser): Promise<{ id: string; code: string; deleted: true }> {
    const current = await this.findOne(id, actor);
    if (current.status !== OrderStatus.CANCELED) {
      throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
    }
    const snapshot = {
      code: current.code,
      customerId: current.customerId,
      status: current.status,
      total: current.total,
      reason: dto.reason.trim(),
    };
    await workflowTransaction(this.dataSource, async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('order')
        .setLock('pessimistic_write')
        .where('order.id = :id', { id })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status !== OrderStatus.CANCELED) {
        throw new ConflictException('Para eliminar el pedido primero debe cancelarlo desde Flujo del pedido');
      }
      order.deletedById = actor.id;
      order.deletionReason = dto.reason.trim();
      await manager.getRepository(Order).save(order);
      await manager.getRepository(Order).softDelete(id);
      await manager.getRepository(AuditEvent).save(manager.getRepository(AuditEvent).create({
        userId: actor.id,
        module: 'orders',
        action: 'ELIMINAR_PEDIDO',
        entity: 'pedidos',
        entityId: id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: snapshot,
      }));
    });
    return { id, code: current.code, deleted: true };
  }

  async workflow(id: string, actor: AuthenticatedUser) {
    await this.findOne(id, actor);
    return this.trackingService.orderSnapshot(id);
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
    requireOpen = true,
  ): Promise<{ customer: Customer; address: CustomerAddress; items: ResolvedItem[]; schedule: OrderScheduleWindow }> {
    const customerRepository = manager?.getRepository(Customer) ?? this.customerRepository;
    const addressRepository = manager?.getRepository(CustomerAddress) ?? this.addressRepository;
    const presentationRepository = manager?.getRepository(ProductPresentation) ?? this.presentationRepository;
    const customer = await customerRepository.findOne({ where: { id: customerId, status: RecordStatus.ACTIVE } });
    if (!customer) throw new NotFoundException('Cliente no encontrado o inactivo');
    const address = await addressRepository.findOne({
      where: { id: addressId, customerId, status: RecordStatus.ACTIVE },
      relations: { zone: { distributionDays: true }, distributionDay: true },
    });
    if (!address) throw new UnprocessableEntityException('El domicilio no pertenece al cliente o está inactivo');
    const schedule = await this.schedulingService.resolve(address, requestedDate, requireOpen);
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
    return { customer, address, items, schedule };
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
        address: { zone: { distributionDays: true }, distributionDay: true },
        createdBy: true,
        confirmedBy: true,
        canceledBy: true,
        details: { presentation: { product: true, unit: true } },
      },
      order: { details: { createdAt: 'ASC' } },
    });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private async resolveConfirmationLink(token: string, allowUsed: boolean): Promise<OrderConfirmationLink> {
    if (token.length < 32 || token.length > 200) throw new NotFoundException('El enlace de confirmación no está disponible');
    const link = await this.confirmationLinkRepository.findOne({ where: { tokenHash: this.hashToken(token) } });
    if (!link) throw new NotFoundException('El enlace de confirmación no está disponible');
    if (link.status === OrderConfirmationLinkStatus.ACTIVE && link.expiresAt <= new Date()) {
      link.status = OrderConfirmationLinkStatus.EXPIRED;
      await this.confirmationLinkRepository.save(link);
      throw new ConflictException('El plazo de confirmación del pedido finalizó');
    }
    if (link.status !== OrderConfirmationLinkStatus.ACTIVE && !(allowUsed && link.status === OrderConfirmationLinkStatus.USED)) {
      throw new NotFoundException('El enlace de confirmación no está disponible');
    }
    return link;
  }

  private async afterConfirmation(order: Order, notificationOwnerId: string, sourceEvent: string): Promise<void> {
    await this.notificationService.safeEnqueueOrderLifecycle(
      order,
      NotificationEvent.ORDER_CONFIRMED,
      notificationOwnerId,
      { productList: this.productList(order), trackingUrl: await this.trackingService.ensureOrderLink(order) },
    );
    await this.trackingService.safeCaptureOrder(order.id, sourceEvent);
    await this.trackingService.refreshStock(`stock.confirm:${order.id}`);
  }

  private publicConfirmationView(order: Order, linkActive: boolean): PublicOrderConfirmationView {
    return {
      orderReference: order.code,
      customerName: order.customer.businessName,
      requestedDate: order.requestedDate,
      orderCutoffAt: order.orderCutoffAt,
      status: order.status,
      total: order.total,
      canConfirm: linkActive && [OrderStatus.DRAFT, OrderStatus.RECEIVED].includes(order.status),
      details: order.details.map((detail) => ({
        product: detail.productDescriptionSnapshot,
        presentation: detail.presentationDescriptionSnapshot,
        unit: detail.unitAbbreviationSnapshot,
        quantity: detail.requestedQuantity,
        subtotal: detail.subtotal,
      })),
    };
  }

  private productList(order: Order): string {
    return order.details
      .map((detail) => `- ${detail.productDescriptionSnapshot} · ${detail.presentationDescriptionSnapshot}: ${Number(detail.requestedQuantity)} ${detail.unitAbbreviationSnapshot}`)
      .join('\n');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicBaseUrl(): string {
    const configured = this.config.get<string>('PUBLIC_APP_URL', '').trim();
    if (configured) return configured.replace(/\/$/, '');
    return this.config.get<string>('CORS_ORIGIN', 'http://localhost:8080').split(',')[0].trim().replace(/\/$/, '');
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
