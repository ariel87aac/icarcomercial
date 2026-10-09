import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { Stock } from '../inventory/entities/stock.entity';
import { OrderDetail } from '../orders/entities/order-detail.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../orders/entities/order.enums';
import { TrackingService } from '../tracking/tracking.service';
import { ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { OrderPreparationDetail } from './entities/order-preparation-detail.entity';
import { OrderPreparation } from './entities/order-preparation.entity';
import { PreparationHistory } from './entities/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from './entities/preparation.enums';

const ACTIVE_PREPARATION_STATUSES = [
  PreparationStatus.PENDING,
  PreparationStatus.IN_PROGRESS,
  PreparationStatus.OBSERVED,
  PreparationStatus.PREPARED,
  PreparationStatus.ASSIGNED,
];

@Injectable()
export class PreparationService {
  constructor(
    @InjectRepository(OrderPreparation) private readonly preparationRepository: Repository<OrderPreparation>,
    @InjectRepository(PreparationHistory) private readonly historyRepository: Repository<PreparationHistory>,
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(Stock) private readonly stockRepository: Repository<Stock>,
    @InjectRepository(InventoryReservation) private readonly reservationRepository: Repository<InventoryReservation>,
    private readonly dataSource: DataSource,
    private readonly trackingService: TrackingService,
  ) {}

  async eligible(query: PreparationQueryDto) {
    const builder = this.orderRepository.createQueryBuilder('orders')
      .leftJoinAndSelect('orders.customer', 'customer')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('orders.details', 'detail')
      .leftJoinAndSelect('detail.presentation', 'presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('presentation.unit', 'unit')
      .where('orders.status = :status', { status: OrderStatus.CONFIRMED })
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM preparaciones_pedido preparation
        WHERE preparation.pedido_id = orders.id
          AND preparation.estado IN (:...activeStatuses)
      )`, { activeStatuses: ACTIVE_PREPARATION_STATUSES })
      .orderBy('orders.requestedDate', 'ASC')
      .addOrderBy('orders.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
    const [orders, total] = await builder.getManyAndCount();
    const detailIds = orders.flatMap((order) => order.details.map((detail) => detail.id));
    const presentationIds = orders.flatMap((order) => order.details.map((detail) => detail.presentationId));
    const [stocks, reservations] = await Promise.all([
      presentationIds.length ? this.stockRepository.find({ where: { presentationId: In(presentationIds) } }) : [],
      detailIds.length ? this.reservationRepository.find({ where: { orderDetailId: In(detailIds) } }) : [],
    ]);
    const stockByPresentation = new Map(stocks.map((stock) => [stock.presentationId, stock]));
    const reservationByDetail = new Map(reservations.map((reservation) => [reservation.orderDetailId, reservation]));
    return paginate(orders.map((order) => ({
      ...order,
      details: order.details.map((detail) => {
        const stock = stockByPresentation.get(detail.presentationId);
        return {
          ...detail,
          reservation: reservationByDetail.get(detail.id) ?? null,
          availableQuantity: stock
            ? (Number(stock.physicalQuantity) - Number(stock.reservedQuantity)).toFixed(3)
            : '0.000',
        };
      }),
    })), total, query.page, query.limit);
  }

  async findAll(query: PreparationQueryDto) {
    const builder = this.preparationRepository.createQueryBuilder('preparation')
      .leftJoinAndSelect('preparation.order', 'orders')
      .leftJoinAndSelect('orders.customer', 'customer')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('preparation.responsible', 'responsible')
      .leftJoinAndSelect('preparation.confirmedBy', 'confirmedBy')
      .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
      .orderBy('orders.requestedDate', 'DESC')
      .addOrderBy('preparation.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
    if (query.status) builder.andWhere('preparation.status = :preparationStatus', { preparationStatus: query.status });
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<OrderPreparation> {
    const preparation = await this.preparationRepository.findOne({
      where: { id },
      relations: {
        order: { customer: true, address: { zone: true }, details: { presentation: { product: true, unit: true } } },
        responsible: true,
        confirmedBy: true,
        details: { orderDetail: { presentation: { product: true, unit: true } }, reservation: true, stock: true, verifiedBy: true },
        history: { user: true },
      },
      order: { history: { occurredAt: 'ASC' } },
    });
    if (!preparation) throw new NotFoundException('Preparación no encontrada');
    preparation.details.sort((a, b) => a.orderDetail.productDescriptionSnapshot.localeCompare(b.orderDetail.productDescriptionSnapshot));
    return preparation;
  }

  async create(dto: CreatePreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
    const id = await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).createQueryBuilder('orders')
        .setLock('pessimistic_write')
        .where('orders.id = :id', { id: dto.orderId })
        .getOne();
      if (!order) throw new NotFoundException('Pedido no encontrado');
      if (order.status !== OrderStatus.CONFIRMED) throw new ConflictException('Solo un pedido Confirmado puede iniciar preparación');
      const duplicate = await manager.getRepository(OrderPreparation).findOne({
        where: { orderId: order.id, status: In(ACTIVE_PREPARATION_STATUSES) },
      });
      if (duplicate) throw new ConflictException('El pedido ya tiene una preparación activa');
      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: order.id } });
      if (!details.length) throw new UnprocessableEntityException('El pedido no contiene detalles para preparar');
      const productionReferences = await manager.query<{ id: string }[]>(`
        SELECT DISTINCT consolidation.id
          FROM consolidaciones_produccion consolidation
          JOIN consolidaciones_detalle consolidated_detail ON consolidated_detail.consolidacion_id = consolidation.id
          JOIN consolidaciones_origen source ON source.detalle_consolidado_id = consolidated_detail.id
         WHERE source.detalle_pedido_id = ANY($1::uuid[])
           AND consolidation.estado = 'CERRADA'
         ORDER BY consolidation.id
      `, [details.map((detail) => detail.id)]);
      const repository = manager.getRepository(OrderPreparation);
      const preparation = await repository.save(repository.create({
        orderId: order.id,
        responsibleId: actor.id,
        status: PreparationStatus.PENDING,
        productionReferences: productionReferences.map((row) => row.id),
        startedAt: new Date(),
        confirmedById: null,
        confirmedAt: null,
      }));
      for (const detail of details) {
        const reservation = await manager.getRepository(InventoryReservation).findOne({ where: { orderDetailId: detail.id } });
        const stock = await manager.getRepository(Stock).findOne({ where: { presentationId: detail.presentationId } });
        if (!stock) throw new UnprocessableEntityException('No existe una existencia asociada a uno de los detalles');
        const requested = Number(detail.requestedQuantity);
        const reserved = Number(reservation?.quantity ?? detail.reservedQuantity);
        const available = Math.max(0, Number(stock.physicalQuantity) - Number(stock.reservedQuantity));
        await manager.getRepository(OrderPreparationDetail).save(manager.getRepository(OrderPreparationDetail).create({
          preparationId: preparation.id,
          orderDetailId: detail.id,
          reservationId: reservation?.id ?? null,
          stockId: stock.id,
          requestedQuantity: requested.toFixed(3),
          reservedQuantity: reserved.toFixed(3),
          availableSnapshot: available.toFixed(3),
          preparedQuantity: '0.000',
          difference: (-requested).toFixed(3),
          observation: null,
          verifiedById: null,
          verifiedAt: null,
        }));
      }
      await this.saveHistory(manager, preparation.id, null, PreparationStatus.PENDING, PreparationEvent.START, actor.id, 'Preparación iniciada', {
        orderId: order.id,
        productionReferences: preparation.productionReferences,
      });
      await this.saveAudit(manager, actor.id, 'INICIAR_PREPARACION', preparation.id, { orderId: order.id });
      return preparation.id;
    });
    const result = await this.findOne(id);
    await this.trackingService.safeCaptureOrder(result.orderId, `preparation.started:${id}`);
    return result;
  }

  async progress(id: string, dto: RegisterPreparationProgressDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
    if (!dto.details.length) throw new BadRequestException('Debe registrar al menos un detalle');
    await this.dataSource.transaction(async (manager) => {
      const preparation = await this.lockPreparation(manager, id);
      if (![PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED].includes(preparation.status)) {
        throw new ConflictException('La preparación ya no admite avances');
      }
      const details = await manager.getRepository(OrderPreparationDetail).createQueryBuilder('detail')
        .setLock('pessimistic_write')
        .where('detail.preparationId = :id', { id })
        .getMany();
      const detailById = new Map(details.map((detail) => [detail.id, detail]));
      if (new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== dto.details.length) {
        throw new BadRequestException('No puede repetir un detalle en el mismo avance');
      }
      const changes: Record<string, unknown>[] = [];
      for (const item of dto.details) {
        const detail = detailById.get(item.preparationDetailId);
        if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la preparación');
        if (item.preparedQuantity > Number(detail.requestedQuantity)) {
          throw new BadRequestException('La cantidad preparada no puede superar la solicitada');
        }
        detail.preparedQuantity = item.preparedQuantity.toFixed(3);
        detail.difference = (item.preparedQuantity - Number(detail.requestedQuantity)).toFixed(3);
        detail.observation = item.observation?.trim() || null;
        detail.verifiedById = item.verified ? actor.id : null;
        detail.verifiedAt = item.verified ? new Date() : null;
        await manager.getRepository(OrderPreparationDetail).save(detail);
        changes.push({ detailId: detail.id, preparedQuantity: detail.preparedQuantity, difference: detail.difference, verified: item.verified });
      }
      const allDetails = await manager.getRepository(OrderPreparationDetail).find({ where: { preparationId: id } });
      const previous = preparation.status;
      preparation.status = allDetails.some((detail) => Number(detail.difference) !== 0)
        ? PreparationStatus.OBSERVED
        : PreparationStatus.IN_PROGRESS;
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.saveHistory(manager, id, previous, preparation.status, PreparationEvent.PROGRESS, actor.id, 'Cantidades de preparación actualizadas', { changes });
      await this.saveAudit(manager, actor.id, 'REGISTRAR_AVANCE_PREPARACION', id, { details: changes.length });
    });
    const result = await this.findOne(id);
    await this.trackingService.safeCaptureOrder(result.orderId, `preparation.progress:${id}:${result.version}`);
    return result;
  }

  async confirm(id: string, dto: ConfirmPreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
    await this.dataSource.transaction(async (manager) => {
      const preparation = await this.lockPreparation(manager, id);
      if (![PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED].includes(preparation.status)) {
        throw new ConflictException('La preparación debe tener detalles verificados antes de confirmarse');
      }
      const details = await manager.getRepository(OrderPreparationDetail).find({ where: { preparationId: id } });
      if (!details.length || details.some((detail) => !detail.verifiedAt)) {
        throw new UnprocessableEntityException('Todos los detalles deben estar verificados');
      }
      const unjustified = details.find((detail) => Number(detail.difference) !== 0 && !detail.observation?.trim());
      if (unjustified) throw new UnprocessableEntityException('Toda diferencia requiere una observación antes de confirmar');
      const previous = preparation.status;
      preparation.status = PreparationStatus.PREPARED;
      preparation.confirmedById = actor.id;
      preparation.confirmedAt = new Date();
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.saveHistory(manager, id, previous, PreparationStatus.PREPARED, PreparationEvent.CONFIRMATION, actor.id, dto.observation?.trim() || 'Preparación confirmada');
      await this.saveAudit(manager, actor.id, 'CONFIRMAR_PREPARACION', id, { orderId: preparation.orderId });
    });
    const result = await this.findOne(id);
    await this.trackingService.safeCaptureOrder(result.orderId, `preparation.confirmed:${id}:${result.version}`);
    return result;
  }

  async history(id: string): Promise<PreparationHistory[]> {
    await this.findOne(id);
    return this.historyRepository.find({ where: { preparationId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }

  private async lockPreparation(manager: EntityManager, id: string): Promise<OrderPreparation> {
    const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
      .setLock('pessimistic_write')
      .where('preparation.id = :id', { id })
      .getOne();
    if (!preparation) throw new NotFoundException('Preparación no encontrada');
    return preparation;
  }

  private async saveHistory(
    manager: EntityManager,
    preparationId: string,
    previousStatus: PreparationStatus | null,
    newStatus: PreparationStatus,
    event: PreparationEvent,
    userId: string,
    observation: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const repository = manager.getRepository(PreparationHistory);
    await repository.save(repository.create({ preparationId, previousStatus, newStatus, event, userId, observation, metadata }));
  }

  private async saveAudit(manager: EntityManager, userId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    const repository = manager.getRepository(AuditEvent);
    await repository.save(repository.create({ userId, module: 'preparations', action, entity: 'preparaciones_pedido', entityId, result: 'EXITOSO', ipAddress: null, metadata }));
  }
}
