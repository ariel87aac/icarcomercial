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
import { CancelPreparationDto, ConfirmPreparationDto, CreatePreparationDto, PreparationQueryDto, RegisterPreparationProgressDto } from './dto/preparation.dto';
import { OrderPreparationDetail } from './entities/order-preparation-detail.entity';
import { OrderPreparation } from './entities/order-preparation.entity';
import { PreparationHistory } from './entities/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from './entities/preparation.enums';

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
          AND preparation.estado <> :canceledStatus
      )`, { canceledStatus: PreparationStatus.CANCELED })
      .orderBy('orders.requestedDate', 'ASC')
      .addOrderBy('orders.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
    if (query.q?.trim()) {
      builder.andWhere(new Brackets((nested) => nested
        .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
    }
    const [orders, total] = await builder.getManyAndCount();
    return paginate(await this.withOrderStockMetrics(orders), total, query.page, query.limit);
  }

  async workQueue(query: PreparationQueryDto) {
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
        SELECT 1 FROM preparaciones_pedido terminal_preparation
         WHERE terminal_preparation.pedido_id = orders.id
           AND terminal_preparation.estado IN (:...terminalStatuses)
      )`, { terminalStatuses: [PreparationStatus.PREPARED, PreparationStatus.ASSIGNED, PreparationStatus.DISPATCHED] })
      .orderBy('orders.requestedDate', 'ASC')
      .addOrderBy('orders.code', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
    if (query.q?.trim()) {
      builder.andWhere(new Brackets((nested) => nested
        .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
    }
    const [orders, total] = await builder.getManyAndCount();
    const preparations = orders.length ? await this.preparationRepository.createQueryBuilder('preparation')
      .leftJoinAndSelect('preparation.responsible', 'responsible')
      .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
      .where('preparation.orderId IN (:...orderIds)', { orderIds: orders.map((order) => order.id) })
      .andWhere('preparation.status IN (:...statuses)', { statuses: [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED] })
      .getMany() : [];
    const preparationByOrder = new Map(preparations.map((preparation) => [preparation.orderId, preparation]));
    const rows = await this.withOrderStockMetrics(orders);
    return paginate(rows.map((order) => ({ ...order, preparation: preparationByOrder.get(order.id) ?? null })), total, query.page, query.limit);
  }

  async findAll(query: PreparationQueryDto) {
    const builder = this.preparationRepository.createQueryBuilder('preparation')
      .leftJoinAndSelect('preparation.order', 'orders')
      .leftJoinAndSelect('orders.customer', 'customer')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('preparation.responsible', 'responsible')
      .leftJoinAndSelect('preparation.confirmedBy', 'confirmedBy')
      .leftJoinAndSelect('preparation.handedOffBy', 'handedOffBy')
      .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
      .orderBy('orders.requestedDate', 'DESC')
      .addOrderBy('preparation.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.customerId) builder.andWhere('orders.customerId = :customerId', { customerId: query.customerId });
    if (query.status) builder.andWhere('preparation.status = :preparationStatus', { preparationStatus: query.status });
    if (query.stage === 'PREPARE') builder.andWhere('preparation.status IN (:...prepareStatuses)', { prepareStatuses: [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED] });
    if (query.stage === 'READY') builder.andWhere('preparation.status = :readyStatus AND preparation.handedOffAt IS NULL', { readyStatus: PreparationStatus.PREPARED });
    if (query.stage === 'HANDED_OFF') builder.andWhere('preparation.status = :handedStatus AND preparation.handedOffAt IS NOT NULL', { handedStatus: PreparationStatus.PREPARED });
    if (query.q?.trim()) {
      builder.andWhere(new Brackets((nested) => nested
        .where('orders.code ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('orders.customerNameSnapshot ILIKE :query', { query: `%${query.q!.trim()}%` })
        .orWhere('customer.businessName ILIKE :query', { query: `%${query.q!.trim()}%` })));
    }
    const [items, total] = await builder.getManyAndCount();
    if (items.length) {
      const shortages = await this.dataSource.query<Array<{ preparation_id: string; shortage_count: string }>>(`
        SELECT detail.preparacion_id,
               COUNT(*) FILTER (WHERE stock.cantidad_fisica - stock.cantidad_reservada < 0)::text AS shortage_count
          FROM preparaciones_detalle detail
          JOIN existencias stock ON stock.id = detail.existencia_id
         WHERE detail.preparacion_id = ANY($1::uuid[])
         GROUP BY detail.preparacion_id
      `, [items.map((item) => item.id)]);
      const byPreparation = new Map(shortages.map((row) => [row.preparation_id, Number(row.shortage_count)]));
      for (const item of items) item.shortageItemCount = byPreparation.get(item.id) ?? 0;
    }
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<OrderPreparation> {
    const preparation = await this.preparationRepository.findOne({
      where: { id },
      relations: {
        order: { customer: true, address: { zone: true }, details: { presentation: { product: true, unit: true } } },
        responsible: true,
        confirmedBy: true,
        canceledBy: true,
        handedOffBy: true,
        details: { orderDetail: { presentation: { product: true, unit: true } }, reservation: true, stock: true, verifiedBy: true },
        history: { user: true },
      },
      order: { history: { occurredAt: 'ASC' } },
    });
    if (!preparation) throw new NotFoundException('Preparación no encontrada');
    preparation.details.sort((a, b) => a.orderDetail.productDescriptionSnapshot.localeCompare(b.orderDetail.productDescriptionSnapshot));
    await this.attachOperationalDetailMetrics(preparation);
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
      const duplicate = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
        .where('preparation.orderId = :orderId', { orderId: order.id })
        .andWhere('preparation.status <> :canceledStatus', { canceledStatus: PreparationStatus.CANCELED })
        .getOne();
      if (duplicate) throw new ConflictException('El pedido ya tiene una preparación registrada y no cancelada');
      const details = await manager.getRepository(OrderDetail).find({ where: { orderId: order.id } });
      if (!details.length) throw new UnprocessableEntityException('El pedido no contiene detalles para preparar');
      const productionReferences = await manager.query<{ id: string }[]>(`
        SELECT DISTINCT consolidation.id
          FROM consolidaciones_produccion consolidation
          JOIN consolidaciones_detalle consolidated_detail ON consolidated_detail.consolidacion_id = consolidation.id
          JOIN consolidaciones_origen source ON source.detalle_consolidado_id = consolidated_detail.id
         WHERE source.detalle_pedido_id = ANY($1::uuid[])
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
        handedOffById: null,
        handedOffAt: null,
      }));
      for (const detail of details) {
        const reservation = await manager.getRepository(InventoryReservation).findOne({ where: { orderDetailId: detail.id } });
        const stock = await manager.getRepository(Stock).findOne({ where: { presentationId: detail.presentationId } });
        if (!stock) throw new UnprocessableEntityException('No existe una existencia asociada a uno de los detalles');
        const requested = Number(detail.requestedQuantity);
        const reserved = Number(reservation?.quantity ?? detail.reservedQuantity);
        const physical = Number(stock.physicalQuantity);
        const available = physical - Number(stock.reservedQuantity);
        const shortage = Math.max(0, Number(stock.reservedQuantity) - physical);
        await manager.getRepository(OrderPreparationDetail).save(manager.getRepository(OrderPreparationDetail).create({
          preparationId: preparation.id,
          orderDetailId: detail.id,
          reservationId: reservation?.id ?? null,
          stockId: stock.id,
          requestedQuantity: requested.toFixed(3),
          reservedQuantity: reserved.toFixed(3),
          availableSnapshot: available.toFixed(3),
          physicalSnapshot: physical.toFixed(3),
          shortageSnapshot: shortage.toFixed(3),
          preparedQuantity: requested.toFixed(3),
          difference: '0.000',
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
      for (const detail of [...details].sort((a, b) => a.stockId.localeCompare(b.stockId))) {
        const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.id = :stockId', { stockId: detail.stockId })
          .getOneOrFail();
        const allocatedRows = await manager.query<Array<{ quantity: string }>>(`
          SELECT COALESCE(SUM(other_detail.cantidad_preparada), 0)::text AS quantity
            FROM preparaciones_detalle other_detail
            JOIN preparaciones_pedido other_preparation ON other_preparation.id = other_detail.preparacion_id
           WHERE other_detail.existencia_id = $1
             AND other_detail.preparacion_id <> $2
             AND other_preparation.estado IN ('PREPARADA', 'ASIGNADA')
        `, [detail.stockId, id]);
        const pickable = Math.max(0, Number(stock.physicalQuantity) - Number(allocatedRows[0]?.quantity ?? 0));
        if (Number(detail.preparedQuantity) > pickable + 0.0005) {
          throw new UnprocessableEntityException(`La cantidad preparada supera la existencia física asignable. Disponible para separar: ${pickable.toFixed(3)}`);
        }
      }
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

  async cancel(id: string, dto: CancelPreparationDto, actor: AuthenticatedUser): Promise<OrderPreparation> {
    await this.dataSource.transaction(async (manager) => {
      const preparation = await this.lockPreparation(manager, id);
      if (![PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED, PreparationStatus.PREPARED].includes(preparation.status)) {
        throw new ConflictException('Solo una preparación no asignada ni despachada puede cancelarse');
      }
      if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
      const routeDelivery = await manager.query<Array<{ id: string }>>('SELECT id FROM rutas_entregas WHERE preparacion_id = $1 LIMIT 1', [id]);
      if (routeDelivery.length) throw new ConflictException('La preparación pertenece a una ruta; retírela o cancele la ruta antes de continuar');
      const previous = preparation.status;
      preparation.status = PreparationStatus.CANCELED;
      preparation.canceledById = actor.id;
      preparation.canceledAt = new Date();
      preparation.cancellationReason = dto.reason.trim();
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.saveHistory(manager, id, previous, PreparationStatus.CANCELED, PreparationEvent.CANCELLATION, actor.id, preparation.cancellationReason, { orderId: preparation.orderId });
      await this.saveAudit(manager, actor.id, 'CANCELAR_PREPARACION', id, { orderId: preparation.orderId, reason: preparation.cancellationReason });
    });
    const result = await this.findOne(id);
    await this.trackingService.safeCaptureOrder(result.orderId, `preparation.canceled:${id}:${result.version}`);
    return result;
  }

  async reopen(id: string, actor: AuthenticatedUser): Promise<OrderPreparation> {
    await this.dataSource.transaction(async (manager) => {
      const preparation = await this.lockPreparation(manager, id);
      if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación lista para despacho puede editarse');
      if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
      const assigned = await manager.query<Array<{ id: string }>>('SELECT id FROM rutas_entregas WHERE preparacion_id = $1 LIMIT 1', [id]);
      if (assigned.length) throw new ConflictException('La preparación ya pertenece a una ruta');
      preparation.status = PreparationStatus.IN_PROGRESS;
      preparation.confirmedById = null;
      preparation.confirmedAt = null;
      await manager.getRepository(OrderPreparation).save(preparation);
      await manager.getRepository(OrderPreparationDetail).update({ preparationId: id }, { verifiedById: null, verifiedAt: null });
      await this.saveHistory(manager, id, PreparationStatus.PREPARED, PreparationStatus.IN_PROGRESS, PreparationEvent.REOPENING, actor.id, 'Preparación reabierta para edición antes de su entrega');
      await this.saveAudit(manager, actor.id, 'REABRIR_PREPARACION', id, { orderId: preparation.orderId });
    });
    return this.findOne(id);
  }

  async handoff(id: string, actor: AuthenticatedUser): Promise<OrderPreparation> {
    await this.dataSource.transaction(async (manager) => {
      const preparation = await this.lockPreparation(manager, id);
      if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación confirmada puede entregarse a Distribución');
      if (preparation.handedOffAt) throw new ConflictException('La preparación ya fue entregada a Distribución');
      preparation.handedOffById = actor.id;
      preparation.handedOffAt = new Date();
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.saveHistory(manager, id, PreparationStatus.PREPARED, PreparationStatus.PREPARED, PreparationEvent.DISTRIBUTION_HANDOFF, actor.id, 'Pedido preparado entregado al flujo de Distribución');
      await this.saveAudit(manager, actor.id, 'ENTREGAR_PREPARACION_DISTRIBUCION', id, { orderId: preparation.orderId });
    });
    const result = await this.findOne(id);
    await this.trackingService.safeCaptureOrder(result.orderId, `preparation.handoff:${id}:${result.version}`);
    return result;
  }

  async history(id: string): Promise<PreparationHistory[]> {
    await this.findOne(id);
    return this.historyRepository.find({ where: { preparationId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }

  private async attachOperationalDetailMetrics(preparation: OrderPreparation): Promise<void> {
    if (!preparation.details.length) return;
    const stockIds = [...new Set(preparation.details.map((detail) => detail.stockId))];
    const orderDetailIds = preparation.details.map((detail) => detail.orderDetailId);
    const [allocations, productionRows] = await Promise.all([
      this.dataSource.query<Array<{ stock_id: string; quantity: string }>>(`
        SELECT other_detail.existencia_id AS stock_id,
               COALESCE(SUM(other_detail.cantidad_preparada), 0)::text AS quantity
          FROM preparaciones_detalle other_detail
          JOIN preparaciones_pedido other_preparation ON other_preparation.id = other_detail.preparacion_id
         WHERE other_detail.existencia_id = ANY($1::uuid[])
           AND other_detail.preparacion_id <> $2
           AND other_preparation.estado IN ('PREPARADA', 'ASIGNADA')
         GROUP BY other_detail.existencia_id
      `, [stockIds, preparation.id]),
      this.dataSource.query<Array<{
        order_detail_id: string;
        id: string;
        code: number;
        status: string;
        scheduled_date: string;
        received_quantity: string;
        planned_quantity: string;
        attributable_received: string;
        production_contribution: string;
      }>>(`
        SELECT source.detalle_pedido_id AS order_detail_id,
               consolidation.id,
               consolidation.codigo AS code,
               consolidation.estado AS status,
               detail.fecha_programada AS scheduled_date,
               detail.cantidad_recibida_almacen::text AS received_quantity,
               detail.cantidad_planificada::text AS planned_quantity,
               CASE
                 WHEN detail.cantidad_requerida_produccion > 0
                   THEN LEAST(source.aporte_produccion_base,
                     detail.cantidad_recibida_almacen * source.aporte_produccion_base / detail.cantidad_requerida_produccion)::text
                 ELSE '0'
               END AS attributable_received,
               source.aporte_produccion_base::text AS production_contribution
          FROM consolidaciones_origen source
          JOIN consolidaciones_detalle detail ON detail.id = source.detalle_consolidado_id
          JOIN consolidaciones_produccion consolidation ON consolidation.id = detail.consolidacion_id
         WHERE source.detalle_pedido_id = ANY($1::uuid[])
         ORDER BY consolidation.codigo, detail.secuencia
      `, [orderDetailIds]),
    ]);
    const allocatedByStock = new Map(allocations.map((row) => [row.stock_id, Number(row.quantity)]));
    const productionByDetail = new Map<string, typeof productionRows>();
    for (const row of productionRows) productionByDetail.set(row.order_detail_id, [...(productionByDetail.get(row.order_detail_id) ?? []), row]);
    for (const detail of preparation.details) {
      const physical = Number(detail.stock.physicalQuantity);
      const totalReserved = Number(detail.stock.reservedQuantity);
      const related = productionByDetail.get(detail.orderDetailId) ?? [];
      const received = related.reduce((sum, row) => sum + Number(row.attributable_received), 0);
      const productionRequired = related.reduce((sum, row) => sum + Number(row.production_contribution), 0);
      detail.physicalQuantityCurrent = physical.toFixed(3);
      detail.totalReservedQuantityCurrent = totalReserved.toFixed(3);
      detail.availableQuantityCurrent = (physical - totalReserved).toFixed(3);
      detail.shortageQuantityCurrent = Math.max(0, totalReserved - physical).toFixed(3);
      detail.pickableQuantityCurrent = Math.max(0, physical - (allocatedByStock.get(detail.stockId) ?? 0)).toFixed(3);
      detail.productionReceivedQuantity = received.toFixed(3);
      detail.productionPendingQuantity = Math.max(0, productionRequired - received).toFixed(3);
      detail.relatedProductionOrders = related.map((row) => ({
        id: row.id,
        code: Number(row.code),
        status: row.status,
        scheduledDate: row.scheduled_date,
        receivedQuantity: Number(row.received_quantity).toFixed(3),
        plannedQuantity: Number(row.planned_quantity).toFixed(3),
      }));
    }
  }

  private async withOrderStockMetrics(orders: Order[]) {
    const detailIds = orders.flatMap((order) => order.details.map((detail) => detail.id));
    const presentationIds = orders.flatMap((order) => order.details.map((detail) => detail.presentationId));
    const [stocks, reservations] = await Promise.all([
      presentationIds.length ? this.stockRepository.find({ where: { presentationId: In(presentationIds) } }) : [],
      detailIds.length ? this.reservationRepository.find({ where: { orderDetailId: In(detailIds) } }) : [],
    ]);
    const stockByPresentation = new Map(stocks.map((stock) => [stock.presentationId, stock]));
    const reservationByDetail = new Map(reservations.map((reservation) => [reservation.orderDetailId, reservation]));
    return orders.map((order) => ({
      ...order,
      details: order.details.map((detail) => {
        const stock = stockByPresentation.get(detail.presentationId);
        return {
          ...detail,
          reservation: reservationByDetail.get(detail.id) ?? null,
          physicalQuantity: Number(stock?.physicalQuantity ?? 0).toFixed(3),
          totalReservedQuantity: Number(stock?.reservedQuantity ?? 0).toFixed(3),
          availableQuantity: stock ? (Number(stock.physicalQuantity) - Number(stock.reservedQuantity)).toFixed(3) : '0.000',
          shortageQuantity: stock ? Math.max(0, Number(stock.reservedQuantity) - Number(stock.physicalQuantity)).toFixed(3) : Number(detail.requestedQuantity).toFixed(3),
          pickableQuantity: Math.max(0, Number(stock?.physicalQuantity ?? 0)).toFixed(3),
        };
      }),
    }));
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
