import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
import { ProductPresentation } from '../catalog/entities/product-presentation.entity';
import { SaleService } from '../commercial/sale.service';
import { Sale } from '../commercial/entities/sale.entity';
import { Vehicle } from '../fleet/entities/vehicle.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { InventoryReservation } from '../inventory/entities/inventory-reservation.entity';
import { InventoryMovementType, InventoryReservationStatus } from '../inventory/entities/inventory.enums';
import { Stock } from '../inventory/entities/stock.entity';
import { OrderPreparationDetail } from '../preparation/entities/order-preparation-detail.entity';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { PreparationHistory } from '../preparation/entities/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from '../preparation/entities/preparation.enums';
import { User } from '../users/entities/user.entity';
import { Zone } from '../zones/entities/zone.entity';
import { TrackingService } from '../tracking/tracking.service';
import {
  AddRouteDeliveriesDto,
  CancelRouteDto,
  CompleteFactoryDeliveryDto,
  CreateDistributionRouteDto,
  DistributionRouteQueryDto,
  PendingDistributionQueryDto,
  RegisterVisitResultDto,
  ReceiveWarehouseReturnDto,
  RescheduleRouteDto,
  RouteTransitionDto,
  SettleRouteDto,
  UpdatePresentationWeightsDto,
  UpdateRouteSequenceDto,
  UpdateRouteVehicleDto,
  WeightReadinessQueryDto,
  WarehouseReturnQueryDto,
} from './dto/distribution.dto';
import { DistributionRoute } from './entities/distribution-route.entity';
import { DistributionDeliveryType, DistributionRouteStatus, RouteDeliveryStatus, RouteHistoryEvent, RouteResponsibleFunction, VisitResultType, WarehouseReturnStatus } from './entities/distribution.enums';
import { RouteDelivery } from './entities/route-delivery.entity';
import { RouteHistory } from './entities/route-history.entity';
import { RouteResponsible } from './entities/route-responsible.entity';
import { RouteSettlement } from './entities/route-settlement.entity';
import { VisitResultDetail } from './entities/visit-result-detail.entity';
import { VisitResult } from './entities/visit-result.entity';
import { WarehouseReturnOrderDetail } from './entities/warehouse-return-order-detail.entity';
import { WarehouseReturnOrder } from './entities/warehouse-return-order.entity';

const ACTIVE_ROUTE_STATUSES = [
  DistributionRouteStatus.DRAFT,
  DistributionRouteStatus.PLANNED,
  DistributionRouteStatus.IN_DELIVERY,
];

@Injectable()
export class DistributionService {
  constructor(
    @InjectRepository(DistributionRoute) private readonly routeRepository: Repository<DistributionRoute>,
    @InjectRepository(RouteDelivery) private readonly deliveryRepository: Repository<RouteDelivery>,
    @InjectRepository(RouteHistory) private readonly historyRepository: Repository<RouteHistory>,
    @InjectRepository(RouteSettlement) private readonly settlementRepository: Repository<RouteSettlement>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(ProductPresentation) private readonly presentationRepository: Repository<ProductPresentation>,
    private readonly dataSource: DataSource,
    private readonly trackingService: TrackingService,
    private readonly saleService: SaleService,
  ) {}

  async findAll(query: DistributionRouteQueryDto) {
    const builder = this.routeRepository.createQueryBuilder('route')
      .leftJoinAndSelect('route.zone', 'zone')
      .leftJoinAndSelect('route.vehicle', 'vehicle')
      .leftJoinAndSelect('route.createdBy', 'createdBy')
      .leftJoinAndSelect('route.responsibles', 'responsible')
      .leftJoinAndSelect('responsible.user', 'responsibleUser')
      .loadRelationCountAndMap('route.deliveryCount', 'route.deliveries')
      .orderBy('route.date', 'DESC')
      .addOrderBy('route.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    this.applyFilters(builder, query);
    const [items, total] = await builder.getManyAndCount();
    await Promise.all(items.map((route) => this.attachLoadMetrics(route)));
    return paginate(items, total, query.page, query.limit);
  }

  async summary(query: DistributionRouteQueryDto) {
    const response = await this.findAll(query);
    const rows = await Promise.all(response.data.map(async (route) => {
      const result = await this.deliveryRepository.createQueryBuilder('delivery')
        .leftJoin('delivery.result', 'result')
        .select('COUNT(delivery.id)::integer', 'total')
        .addSelect(`COUNT(*) FILTER (WHERE result.resultado = 'ENTREGADA')::integer`, 'complete')
        .addSelect(`COUNT(*) FILTER (WHERE result.resultado = 'ENTREGA_PARCIAL')::integer`, 'partial')
        .addSelect(`COUNT(*) FILTER (WHERE result.resultado = 'NO_ENTREGADA')::integer`, 'notDelivered')
        .addSelect(`COALESCE((SELECT SUM(detail.cantidad_devuelta) FROM resultados_visita_detalle detail JOIN resultados_visita visit ON visit.id = detail.resultado_visita_id JOIN rutas_entregas route_delivery ON route_delivery.id = visit.ruta_entrega_id WHERE route_delivery.ruta_id = :routeId), 0)`, 'returnedQuantity')
        .where('delivery.routeId = :routeId', { routeId: route.id })
        .getRawOne<Record<string, string>>();
      const settlement = await this.settlementRepository.findOne({ where: { routeId: route.id } });
      return { ...route, metrics: { ...result, acceptedReturnQuantity: settlement?.acceptedReturnQuantity ?? '0.000' }, settlement };
    }));
    return { ...response, data: rows };
  }

  async findOne(id: string): Promise<DistributionRoute> {
    const route = await this.routeRepository.findOne({
      where: { id },
      relations: {
        zone: true,
        vehicle: true,
        createdBy: true,
        rescheduledBy: true,
        canceledBy: true,
      },
    });
    if (!route) throw new NotFoundException('Ruta de distribución no encontrada');

    // Cargar las colecciones por separado evita el producto cartesiano entre
    // responsables, entregas, detalles e historial al consultar una ruta.
    [route.responsibles, route.deliveries, route.history] = await Promise.all([
      this.dataSource.getRepository(RouteResponsible).find({
        where: { routeId: id },
        relations: { user: true },
        order: { isPrincipal: 'DESC', createdAt: 'ASC' },
      }),
      this.loadDeliveries(id),
      this.historyRepository.find({
        where: { routeId: id },
        relations: { user: true },
        order: { occurredAt: 'ASC' },
      }),
    ]);
    await this.attachLoadMetrics(route);
    return route;
  }

  async responsibleOptions(): Promise<User[]> {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'role')
      .where('user.status = :status', { status: RecordStatus.ACTIVE })
      .andWhere('role.name IN (:...roles)', { roles: ['REPARTIDOR', 'DISTRIBUCION'] })
      .orderBy('user.name', 'ASC')
      .getMany();
  }

  async myRoutes(actor: AuthenticatedUser): Promise<DistributionRoute[]> {
    const builder = this.routeRepository.createQueryBuilder('route');
    if (!this.canControlAllDeliveries(actor)) {
      builder.innerJoin('route.responsibles', 'scope', 'scope.userId = :userId', { userId: actor.id });
    }
    const routes = await builder
      .where('route.status IN (:...statuses)', { statuses: [DistributionRouteStatus.PLANNED, DistributionRouteStatus.IN_DELIVERY] })
      .orderBy('route.date', 'ASC')
      .addOrderBy('route.createdAt', 'ASC')
      .getMany();
    return Promise.all(routes.map((route) => this.findOne(route.id)));
  }

  async pendingDeliveries(query: PendingDistributionQueryDto) {
    const builder = this.dataSource.getRepository(OrderPreparation).createQueryBuilder('preparation')
      .leftJoinAndSelect('preparation.order', 'orders')
      .leftJoinAndSelect('orders.customer', 'customer')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('preparation.responsible', 'responsible')
      .leftJoinAndSelect('preparation.handedOffBy', 'handedOffBy')
      .loadRelationCountAndMap('preparation.detailCount', 'preparation.details')
      .where('preparation.status = :status', { status: PreparationStatus.PREPARED })
      .andWhere('preparation.handedOffAt IS NOT NULL')
      .andWhere('NOT EXISTS (SELECT 1 FROM rutas_entregas pending_delivery WHERE pending_delivery.preparacion_id = preparation.id)')
      .orderBy('orders.requestedDate', 'ASC')
      .addOrderBy('preparation.handedOffAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.deliveryDate) builder.andWhere('orders.requestedDate = :deliveryDate', { deliveryDate: query.deliveryDate });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.q?.trim()) {
      builder.andWhere('(orders.code ILIKE :query OR orders.customerNameSnapshot ILIKE :query OR customer.businessName ILIKE :query)', {
        query: `%${query.q.trim()}%`,
      });
    }
    const [items, total] = await builder.getManyAndCount();
    if (items.length) {
      const metrics = await this.dataSource.query<Array<{ preparation_id: string; load_weight_kg: string; missing_weights: string[] | null }>>(`
        SELECT detail.preparacion_id AS preparation_id,
               COALESCE(SUM(detail.cantidad_preparada * COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion))
                 FILTER (WHERE COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion) IS NOT NULL), 0)::text AS load_weight_kg,
               array_agg(DISTINCT product.nombre || ' · ' || presentation.descripcion)
                 FILTER (WHERE detail.cantidad_preparada > 0 AND COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion) IS NULL) AS missing_weights
          FROM preparaciones_detalle detail
          JOIN pedidos_detalle order_detail ON order_detail.id = detail.detalle_pedido_id
          JOIN presentaciones_producto presentation ON presentation.id = order_detail.presentacion_id
          JOIN unidades_medida unit ON unit.id = presentation.unidad_id
          JOIN productos product ON product.id = presentation.producto_id
         WHERE detail.preparacion_id = ANY($1::uuid[])
         GROUP BY detail.preparacion_id
      `, [items.map((item) => item.id)]);
      const metricsByPreparation = new Map(metrics.map((row) => [row.preparation_id, row]));
      for (const item of items) {
        const metric = metricsByPreparation.get(item.id);
        Object.assign(item, {
          loadWeightKg: Number(metric?.load_weight_kg ?? 0).toFixed(3),
          missingWeightPresentations: metric?.missing_weights ?? [],
        });
      }
    }
    return paginate(items, total, query.page, query.limit);
  }

  async weightReadiness(query: WeightReadinessQueryDto) {
    const builder = this.presentationRepository.createQueryBuilder('presentation')
      .leftJoinAndSelect('presentation.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.productLine', 'productLine')
      .leftJoinAndSelect('presentation.unit', 'unit')
      .where('presentation.status = :status', { status: RecordStatus.ACTIVE })
      .andWhere('product.status = :status', { status: RecordStatus.ACTIVE })
      .orderBy('product.code', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.missingOnly) builder.andWhere('(COALESCE(presentation.weightKg, unit.kilogramFactor * presentation.conversionFactor) IS NULL OR COALESCE(presentation.weightKg, unit.kilogramFactor * presentation.conversionFactor) <= 0)');
    if (query.q?.trim()) {
      builder.andWhere('(CAST(product.code AS text) ILIKE :query OR product.name ILIKE :query OR presentation.description ILIKE :query)', { query: `%${query.q.trim()}%` });
    }
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async updatePresentationWeights(dto: UpdatePresentationWeightsDto, actor: AuthenticatedUser) {
    if (new Set(dto.items.map((item) => item.presentationId)).size !== dto.items.length) {
      throw new BadRequestException('No puede repetir una presentación');
    }
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ProductPresentation);
      for (const item of [...dto.items].sort((a, b) => a.presentationId.localeCompare(b.presentationId))) {
        const presentation = await repository.createQueryBuilder('presentation')
          .setLock('pessimistic_write')
          .where('presentation.id = :id', { id: item.presentationId })
          .getOne();
        if (!presentation) throw new NotFoundException('Presentación no encontrada');
        const previousWeightKg = presentation.weightKg;
        presentation.weightKg = item.weightKg.toFixed(6);
        await repository.save(presentation);
        const auditRepository = manager.getRepository(AuditEvent);
        await auditRepository.save(auditRepository.create({
          userId: actor.id,
          module: 'distribution',
          action: 'ACTUALIZAR_PESO_PRESENTACION',
          entity: 'presentaciones_producto',
          entityId: presentation.id,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { previousWeightKg, weightKg: presentation.weightKg },
        }));
      }
    });
    return { updated: dto.items.length };
  }

  async create(dto: CreateDistributionRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    const id = await this.dataSource.transaction(async (manager) => {
      const zone = await manager.getRepository(Zone).findOne({ where: { id: dto.zoneId, status: RecordStatus.ACTIVE } });
      if (!zone) throw new NotFoundException('Zona no encontrada o inactiva');
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new UnprocessableEntityException('El vehículo debe estar activo');
      if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) throw new UnprocessableEntityException('El vehículo debe tener una capacidad válida en kg');
      const responsibleIds = [...new Set(dto.responsibleIds)];
      if (responsibleIds.length !== dto.responsibleIds.length || !responsibleIds.includes(dto.principalResponsibleId)) {
        throw new BadRequestException('Debe identificar un responsable principal dentro de la asignación');
      }
      const users = await manager.getRepository(User).createQueryBuilder('user')
        .leftJoinAndSelect('user.roles', 'role')
        .where('user.id IN (:...ids)', { ids: responsibleIds })
        .andWhere('user.status = :status', { status: RecordStatus.ACTIVE })
        .andWhere('role.name IN (:...roles)', { roles: ['REPARTIDOR', 'DISTRIBUCION'] })
        .getMany();
      if (users.length !== responsibleIds.length) throw new UnprocessableEntityException('Todos los responsables deben estar activos y autorizados para distribución');
      await this.assertResourceAvailability(manager, dto.date, dto.vehicleId, responsibleIds);
      const sequence = await manager.query<{ value: string }[]>(`SELECT nextval('rutas_codigo_seq')::text AS value`);
      const repository = manager.getRepository(DistributionRoute);
      const route = await repository.save(repository.create({
        code: `RUTA-${dto.date.replaceAll('-', '')}-${sequence[0].value.padStart(4, '0')}`,
        date: dto.date,
        zoneId: dto.zoneId,
        vehicleId: dto.vehicleId,
        status: DistributionRouteStatus.DRAFT,
        createdById: actor.id,
        observation: dto.observation?.trim() || null,
        departedById: null,
        departedAt: null,
        finishedById: null,
        finishedAt: null,
        settledById: null,
        settledAt: null,
        rescheduledById: null,
        rescheduledAt: null,
        rescheduleReason: null,
        canceledById: null,
        canceledAt: null,
        cancellationReason: null,
      }));
      for (const userId of responsibleIds) {
        const isPrincipal = userId === dto.principalResponsibleId;
        await manager.getRepository(RouteResponsible).save(manager.getRepository(RouteResponsible).create({
          routeId: route.id,
          userId,
          function: isPrincipal ? RouteResponsibleFunction.PRINCIPAL : RouteResponsibleFunction.SUPPORT,
          isPrincipal,
        }));
      }
      await this.saveHistory(manager, route.id, null, DistributionRouteStatus.DRAFT, RouteHistoryEvent.CREATION, actor.id, 'Ruta creada y recursos asignados', { responsibleIds });
      const preparationIds = dto.preparationIds ?? [];
      if (preparationIds.length) {
        await this.assignPreparations(manager, route, preparationIds, actor.id);
        await this.saveHistory(manager, route.id, route.status, route.status, RouteHistoryEvent.ASSIGNMENT, actor.id, 'Preparaciones agregadas al crear la ruta', { preparationIds, operationalDate: route.date });
      }
      await this.saveAudit(manager, actor.id, 'CREAR_RUTA', route.id, { date: route.date, zoneId: route.zoneId, vehicleId: route.vehicleId, preparationIds });
      return route.id;
    });
    return this.findOne(id);
  }

  async updateVehicle(id: string, dto: UpdateRouteVehicleDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'El vehículo sólo puede cambiarse mientras la ruta está en Borrador');
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new UnprocessableEntityException('El vehículo debe estar activo');
      if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) throw new UnprocessableEntityException('El vehículo debe tener una capacidad válida en kg');
      const responsibles = await manager.getRepository(RouteResponsible).find({ where: { routeId: id } });
      await this.assertResourceAvailability(manager, route.date, vehicle.id, responsibles.map((item) => item.userId), route.id);
      const load = await this.routeLoad(manager, id);
      if (!load.missingWeightPresentations.length && load.loadWeightKg > Number(vehicle.capacityKg) + 0.0005) {
        const excess = load.loadWeightKg - Number(vehicle.capacityKg);
        throw new UnprocessableEntityException(`La carga de ${load.loadWeightKg.toFixed(3)} kg supera la capacidad de ${Number(vehicle.capacityKg).toFixed(3)} kg por ${excess.toFixed(3)} kg`);
      }
      const previousVehicleId = route.vehicleId;
      route.vehicleId = vehicle.id;
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.VEHICLE_CHANGE, actor.id, `Vehículo cambiado a ${vehicle.plate}`, { previousVehicleId, vehicleId: vehicle.id, capacityKg: vehicle.capacityKg, loadWeightKg: load.loadWeightKg });
      await this.saveAudit(manager, actor.id, 'CAMBIAR_VEHICULO_RUTA', id, { previousVehicleId, vehicleId: vehicle.id, capacityKg: vehicle.capacityKg, loadWeightKg: load.loadWeightKg });
    });
    return this.findOne(id);
  }

  async addDeliveries(id: string, dto: AddRouteDeliveriesDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador admite pedidos');
      const preparationIds = [...new Set(dto.preparationIds)];
      if (preparationIds.length !== dto.preparationIds.length) throw new BadRequestException('No puede repetir una preparación');
      await this.assignPreparations(manager, route, preparationIds, actor.id);
      await this.saveHistory(manager, route.id, route.status, route.status, RouteHistoryEvent.ASSIGNMENT, actor.id, 'Preparaciones agregadas a la ruta', { preparationIds, operationalDate: route.date });
      await this.saveAudit(manager, actor.id, 'ASIGNAR_ENTREGAS_RUTA', route.id, { preparationIds });
    });
    return this.findOne(id);
  }

  async removeDelivery(id: string, deliveryId: string, actor: AuthenticatedUser): Promise<DistributionRoute> {
    const orderId = await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador permite retirar entregas');
      const delivery = await manager.getRepository(RouteDelivery).findOne({
        where: { id: deliveryId, routeId: id },
        relations: { preparation: true, order: true },
      });
      if (!delivery) throw new NotFoundException('Entrega de ruta no encontrada');
      if (delivery.preparation.status !== PreparationStatus.ASSIGNED) throw new ConflictException('La preparación ya no puede retirarse de la ruta');
      delivery.preparation.status = PreparationStatus.PREPARED;
      delivery.preparation.handedOffById = null;
      delivery.preparation.handedOffAt = null;
      await manager.getRepository(OrderPreparation).save(delivery.preparation);
      await this.savePreparationHistory(manager, delivery.preparation.id, PreparationStatus.ASSIGNED, PreparationStatus.PREPARED, PreparationEvent.UNASSIGNMENT, actor.id, `Retirada de ${route.code}`);
      await manager.getRepository(RouteDelivery).delete(delivery.id);
      const remaining = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, order: { position: 'ASC', createdAt: 'ASC' } });
      await manager.getRepository(RouteDelivery).update({ routeId: id }, { position: null });
      for (const [index, item] of remaining.entries()) await manager.getRepository(RouteDelivery).update({ id: item.id }, { position: index + 1 });
      await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.UNASSIGNMENT, actor.id, `Pedido ${delivery.order.code} retirado de la ruta`, { deliveryId, preparationId: delivery.preparationId, orderId: delivery.orderId });
      await this.saveAudit(manager, actor.id, 'RETIRAR_ENTREGA_RUTA', id, { deliveryId, preparationId: delivery.preparationId, orderId: delivery.orderId });
      return delivery.orderId;
    });
    await this.trackingService.safeCaptureOrder(orderId, `route.delivery.removed:${deliveryId}`);
    return this.findOne(id);
  }

  async reschedule(id: string, dto: RescheduleRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      if (![DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED].includes(route.status)) {
        throw new ConflictException('Solo una ruta sin salida registrada puede reprogramarse');
      }
      if (route.date === dto.date) throw new BadRequestException('La nueva fecha debe ser diferente a la actual');
      const responsibles = await manager.getRepository(RouteResponsible).find({ where: { routeId: id } });
      await this.assertResourceAvailability(manager, dto.date, route.vehicleId, responsibles.map((item) => item.userId), route.id);
      const previousDate = route.date;
      route.date = dto.date;
      route.rescheduledById = actor.id;
      route.rescheduledAt = new Date();
      route.rescheduleReason = dto.reason.trim();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.RESCHEDULING, actor.id, route.rescheduleReason, { previousDate, date: route.date });
      await this.saveAudit(manager, actor.id, 'REPROGRAMAR_RUTA', id, { previousDate, date: route.date, reason: route.rescheduleReason });
    });
    await this.trackingService.safeCaptureRoute(id, `route.rescheduled:${id}:${dto.date}`);
    return this.findOne(id);
  }

  async cancel(id: string, dto: CancelRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    const orderIds = await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      if (![DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED].includes(route.status)) {
        throw new ConflictException('Solo una ruta sin salida registrada puede cancelarse');
      }
      const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, relations: { preparation: true, order: true } });
      for (const delivery of deliveries) {
        if (delivery.preparation.status !== PreparationStatus.ASSIGNED) throw new ConflictException('Una preparación de la ruta ya cambió de estado');
        delivery.preparation.status = PreparationStatus.PREPARED;
        delivery.preparation.handedOffById = null;
        delivery.preparation.handedOffAt = null;
        await manager.getRepository(OrderPreparation).save(delivery.preparation);
        await this.savePreparationHistory(manager, delivery.preparation.id, PreparationStatus.ASSIGNED, PreparationStatus.PREPARED, PreparationEvent.UNASSIGNMENT, actor.id, `Ruta ${route.code} cancelada: ${dto.reason.trim()}`);
      }
      const deliverySummary = deliveries.map((delivery) => ({ deliveryId: delivery.id, preparationId: delivery.preparationId, orderId: delivery.orderId, orderCode: delivery.order.code }));
      await manager.getRepository(RouteDelivery).delete({ routeId: id });
      const previous = route.status;
      route.status = DistributionRouteStatus.CANCELED;
      route.canceledById = actor.id;
      route.canceledAt = new Date();
      route.cancellationReason = dto.reason.trim();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, previous, DistributionRouteStatus.CANCELED, RouteHistoryEvent.CANCELLATION, actor.id, route.cancellationReason, { deliveries: deliverySummary });
      await this.saveAudit(manager, actor.id, 'CANCELAR_RUTA', id, { previousStatus: previous, reason: route.cancellationReason, deliveries: deliverySummary });
      return deliveries.map((delivery) => delivery.orderId);
    });
    await Promise.all(orderIds.map((orderId) => this.trackingService.safeCaptureOrder(orderId, `route.canceled:${id}`)));
    return this.findOne(id);
  }

  async updateSequence(id: string, dto: UpdateRouteSequenceDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'La secuencia solo puede modificarse en Borrador');
      const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id } });
      if (!deliveries.length || dto.deliveries.length !== deliveries.length) throw new UnprocessableEntityException('La secuencia debe incluir todas las entregas de la ruta');
      const expectedIds = new Set(deliveries.map((delivery) => delivery.id));
      const positions = dto.deliveries.map((delivery) => delivery.position).sort((a, b) => a - b);
      if (new Set(dto.deliveries.map((delivery) => delivery.routeDeliveryId)).size !== deliveries.length || dto.deliveries.some((delivery) => !expectedIds.has(delivery.routeDeliveryId))) {
        throw new BadRequestException('La secuencia contiene entregas repetidas o ajenas a la ruta');
      }
      if (positions.some((position, index) => position !== index + 1)) throw new BadRequestException('Las posiciones deben ser únicas y consecutivas desde 1');
      await manager.getRepository(RouteDelivery).update({ routeId: id }, { position: null });
      for (const item of dto.deliveries) await manager.getRepository(RouteDelivery).update({ id: item.routeDeliveryId }, { position: item.position });
      await this.saveHistory(manager, id, route.status, route.status, RouteHistoryEvent.SEQUENCE, actor.id, 'Secuencia manual actualizada', { sequence: dto.deliveries });
      await this.saveAudit(manager, actor.id, 'ACTUALIZAR_SECUENCIA_RUTA', id, { deliveries: deliveries.length });
    });
    await this.trackingService.safeCaptureRoute(id, `route.sequence:${id}:${Date.now()}`);
    return this.findOne(id);
  }

  async plan(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador puede planificarse');
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: route.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new UnprocessableEntityException('El vehículo asignado ya no está activo');
      const responsibles = await manager.getRepository(RouteResponsible).find({ where: { routeId: id } });
      if (!responsibles.length || !responsibles.some((responsible) => responsible.isPrincipal)) throw new UnprocessableEntityException('La ruta requiere responsables y uno principal');
      await this.assertResourceAvailability(manager, route.date, route.vehicleId, responsibles.map((responsible) => responsible.userId), route.id);
      const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, relations: { address: true, preparation: true } });
      if (!deliveries.length) throw new UnprocessableEntityException('La ruta debe contener al menos una entrega');
      const positions = deliveries.map((delivery) => delivery.position).sort((a, b) => Number(a) - Number(b));
      if (positions.some((position, index) => position !== index + 1)) throw new UnprocessableEntityException('La secuencia debe ser única y consecutiva');
      const invalidAddress = deliveries.find((delivery) => !this.validCoordinates(delivery.address.latitude, delivery.address.longitude));
      if (invalidAddress) throw new UnprocessableEntityException(`El domicilio del pedido ${invalidAddress.orderId} no tiene coordenadas válidas`);
      const invalidPreparation = deliveries.find((delivery) => delivery.preparation.status !== PreparationStatus.ASSIGNED);
      if (invalidPreparation) throw new ConflictException('Una preparación asignada cambió de estado');
      await this.assertVehicleCapacity(manager, route.id, vehicle);
      route.status = DistributionRouteStatus.PLANNED;
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED, RouteHistoryEvent.PLANNING, actor.id, dto.observation?.trim() || 'Ruta planificada');
      await this.saveAudit(manager, actor.id, 'PLANIFICAR_RUTA', id, { deliveries: deliveries.length });
    });
    await this.trackingService.safeCaptureRoute(id, `route.planned:${id}`);
    return this.findOne(id);
  }

  async departure(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.PLANNED, 'La salida solo puede registrarse desde una ruta Planificada');
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: route.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new UnprocessableEntityException('El vehículo asignado ya no está activo');
      await this.assertVehicleCapacity(manager, route.id, vehicle);
      const deliveries = await manager.getRepository(RouteDelivery).find({
        where: { routeId: id },
        relations: { preparation: { details: true } },
        order: { position: 'ASC' },
      });
      if (!deliveries.length) throw new UnprocessableEntityException('La ruta no contiene entregas');
      for (const delivery of deliveries) {
        if (delivery.preparation.status !== PreparationStatus.ASSIGNED) throw new ConflictException('Una preparación ya no está disponible para despacho');
        for (const detail of [...delivery.preparation.details].sort((a, b) => a.stockId.localeCompare(b.stockId))) {
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock').setLock('pessimistic_write').where('stock.id = :id', { id: detail.stockId }).getOneOrFail();
          const prepared = Number(detail.preparedQuantity);
          if (prepared > Number(stock.physicalQuantity)) throw new ConflictException('La existencia física es insuficiente para registrar la salida');
          let reservationQuantity = 0;
          if (detail.reservationId) {
            const reservation = await manager.getRepository(InventoryReservation).createQueryBuilder('reservation').setLock('pessimistic_write').where('reservation.id = :id', { id: detail.reservationId }).getOne();
            if (!reservation || reservation.status !== InventoryReservationStatus.ACTIVE) throw new ConflictException('La reserva ya fue consumida o no está disponible');
            reservationQuantity = Number(reservation.quantity);
            reservation.status = InventoryReservationStatus.CONSUMED;
            await manager.getRepository(InventoryReservation).save(reservation);
          }
          const previous = Number(stock.physicalQuantity);
          const next = previous - prepared;
          const nextReserved = Number(stock.reservedQuantity) - reservationQuantity;
          if (nextReserved < -0.0005) throw new ConflictException('Los saldos reservados cambiaron durante el despacho');
          stock.physicalQuantity = next.toFixed(3);
          stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
          await manager.getRepository(Stock).save(stock);
          if (prepared > 0) {
            await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
              stockId: stock.id,
              type: InventoryMovementType.DISPATCH_OUT,
              quantity: prepared.toFixed(3),
              previousBalance: previous.toFixed(3),
              newBalance: next.toFixed(3),
              reason: `Salida de ${route.code}`,
              userId: actor.id,
              orderId: delivery.orderId,
              orderDetailId: detail.orderDetailId,
              routeDeliveryId: delivery.id,
            }));
          }
        }
        delivery.preparation.status = PreparationStatus.DISPATCHED;
        await manager.getRepository(OrderPreparation).save(delivery.preparation);
        await this.savePreparationHistory(manager, delivery.preparation.id, PreparationStatus.ASSIGNED, PreparationStatus.DISPATCHED, PreparationEvent.DISPATCH, actor.id, `Despachada en ${route.code}`);
      }
      route.status = DistributionRouteStatus.IN_DELIVERY;
      route.departedById = actor.id;
      route.departedAt = new Date();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.PLANNED, DistributionRouteStatus.IN_DELIVERY, RouteHistoryEvent.DEPARTURE, actor.id, dto.observation?.trim() || 'Salida registrada', { deliveries: deliveries.length });
      await this.saveAudit(manager, actor.id, 'REGISTRAR_SALIDA_RUTA', id, { deliveries: deliveries.length });
    });
    await this.trackingService.safeCaptureRoute(id, `route.departure:${id}`);
    return this.findOne(id);
  }

  async completeFactoryDelivery(
    dto: CompleteFactoryDeliveryDto,
    actor: AuthenticatedUser,
  ): Promise<{ delivery: RouteDelivery; generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> }> {
    const transactionResult = await this.dataSource.transaction(async (manager) => {
      const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
        .setLock('pessimistic_write', undefined, ['preparation'])
        .innerJoinAndSelect('preparation.order', 'orders')
        .innerJoinAndSelect('orders.customer', 'customer')
        .innerJoinAndSelect('orders.address', 'address')
        .innerJoinAndSelect('preparation.details', 'detail')
        .innerJoinAndSelect('detail.orderDetail', 'orderDetail')
        .where('preparation.id = :id', { id: dto.preparationId })
        .getOne();
      if (!preparation) throw new NotFoundException('Preparación no encontrada');
      if (preparation.status !== PreparationStatus.PREPARED || !preparation.handedOffAt) {
        throw new ConflictException('Solo un pedido preparado y entregado a Distribución puede cerrarse en fábrica');
      }
      const existingDelivery = await manager.getRepository(RouteDelivery).findOne({ where: { preparationId: preparation.id } });
      if (existingDelivery) throw new ConflictException('La preparación ya fue asignada a reparto o entrega en fábrica');
      if (dto.result !== VisitResultType.DELIVERED && !dto.observation?.trim()) {
        throw new BadRequestException('La entrega parcial o rechazada en fábrica requiere observación');
      }

      const detailById = new Map(preparation.details.map((detail) => [detail.id, detail]));
      if (dto.details.length !== detailById.size || new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== detailById.size) {
        throw new BadRequestException('Debe registrar exactamente todos los productos preparados');
      }
      let deliveredTotal = 0;
      let preparedTotal = 0;
      for (const item of dto.details) {
        const detail = detailById.get(item.preparationDetailId);
        if (!detail) throw new UnprocessableEntityException('El producto no pertenece a la preparación seleccionada');
        const prepared = Number(detail.preparedQuantity);
        if (item.deliveredQuantity + item.returnedQuantity > prepared + 0.0005) {
          throw new BadRequestException('Las cantidades entregada y no retirada no pueden superar la preparada');
        }
        if (Math.abs(item.deliveredQuantity + item.returnedQuantity - prepared) > 0.0005) {
          throw new UnprocessableEntityException('Toda cantidad preparada debe quedar entregada o disponible nuevamente en Almacén');
        }
        deliveredTotal += item.deliveredQuantity;
        preparedTotal += prepared;
      }
      if (dto.result === VisitResultType.DELIVERED && Math.abs(deliveredTotal - preparedTotal) > 0.0005) {
        throw new UnprocessableEntityException('Una entrega completa debe entregar todas las cantidades');
      }
      if (dto.result === VisitResultType.NOT_DELIVERED && deliveredTotal > 0.0005) {
        throw new UnprocessableEntityException('Un pedido rechazado no puede registrar cantidades entregadas');
      }
      if (dto.result === VisitResultType.PARTIAL && (deliveredTotal <= 0 || deliveredTotal >= preparedTotal)) {
        throw new UnprocessableEntityException('Una entrega parcial debe registrar una cantidad mayor que cero y menor que la preparada');
      }

      const deliveryRepository = manager.getRepository(RouteDelivery);
      const delivery = await deliveryRepository.save(deliveryRepository.create({
        routeId: null,
        deliveryType: DistributionDeliveryType.FACTORY,
        preparationId: preparation.id,
        orderId: preparation.orderId,
        addressId: preparation.order.addressId,
        position: null,
        status: RouteDeliveryStatus.PENDING,
      }));
      const inputByDetail = new Map(dto.details.map((item) => [item.preparationDetailId, item]));
      for (const detail of [...preparation.details].sort((a, b) => a.stockId.localeCompare(b.stockId))) {
        const input = inputByDetail.get(detail.id)!;
        const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
          .setLock('pessimistic_write')
          .where('stock.id = :id', { id: detail.stockId })
          .getOneOrFail();
        const delivered = Number(input.deliveredQuantity);
        const previous = Number(stock.physicalQuantity);
        if (delivered > previous + 0.0005) throw new ConflictException('La existencia física es insuficiente para completar la entrega en fábrica');
        let reservationQuantity = 0;
        if (detail.reservationId) {
          const reservation = await manager.getRepository(InventoryReservation).createQueryBuilder('reservation')
            .setLock('pessimistic_write')
            .where('reservation.id = :id', { id: detail.reservationId })
            .getOne();
          if (!reservation || reservation.status !== InventoryReservationStatus.ACTIVE) {
            throw new ConflictException('La reserva ya fue consumida o no está disponible');
          }
          reservationQuantity = Number(reservation.quantity);
          reservation.status = InventoryReservationStatus.CONSUMED;
          await manager.getRepository(InventoryReservation).save(reservation);
        }
        const next = previous - delivered;
        const nextReserved = Number(stock.reservedQuantity) - reservationQuantity;
        if (nextReserved < -0.0005) throw new ConflictException('Los saldos reservados cambiaron durante la entrega');
        stock.physicalQuantity = next.toFixed(3);
        stock.reservedQuantity = Math.max(0, nextReserved).toFixed(3);
        await manager.getRepository(Stock).save(stock);
        if (delivered > 0) {
          await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
            stockId: stock.id,
            type: InventoryMovementType.DISPATCH_OUT,
            quantity: delivered.toFixed(3),
            previousBalance: previous.toFixed(3),
            newBalance: next.toFixed(3),
            reason: `Entrega en fábrica del pedido ${preparation.order.code}`,
            userId: actor.id,
            orderId: preparation.orderId,
            orderDetailId: detail.orderDetailId,
            routeDeliveryId: delivery.id,
          }));
        }
      }

      preparation.status = PreparationStatus.DISPATCHED;
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.savePreparationHistory(manager, preparation.id, PreparationStatus.PREPARED, PreparationStatus.DISPATCHED, PreparationEvent.DISPATCH, actor.id, 'Entrega directa en fábrica');

      const resultRepository = manager.getRepository(VisitResult);
      const result = await resultRepository.save(resultRepository.create({
        routeDeliveryId: delivery.id,
        result: dto.result,
        userId: actor.id,
        observation: dto.observation?.trim() || null,
      }));
      for (const item of dto.details) {
        await manager.getRepository(VisitResultDetail).save(manager.getRepository(VisitResultDetail).create({
          visitResultId: result.id,
          preparationDetailId: item.preparationDetailId,
          deliveredQuantity: item.deliveredQuantity.toFixed(3),
          returnedQuantity: item.returnedQuantity.toFixed(3),
          acceptedReturnQuantity: item.returnedQuantity.toFixed(3),
          returnAcceptedById: item.returnedQuantity > 0 ? actor.id : null,
          returnAcceptedAt: item.returnedQuantity > 0 ? new Date() : null,
        }));
      }
      delivery.status = RouteDeliveryStatus.VISITED;
      await deliveryRepository.save(delivery);

      let saleId: string | null = null;
      if ([VisitResultType.DELIVERED, VisitResultType.PARTIAL].includes(dto.result)) {
        saleId = await this.saleService.createInTransaction(manager, result.id, actor);
      }
      const auditRepository = manager.getRepository(AuditEvent);
      await auditRepository.save(auditRepository.create({
        userId: actor.id,
        module: 'distribution',
        action: 'REGISTRAR_ENTREGA_FABRICA',
        entity: 'rutas_entregas',
        entityId: delivery.id,
        result: 'EXITOSO',
        ipAddress: null,
        metadata: { preparationId: preparation.id, orderId: preparation.orderId, result: dto.result, deliveredTotal: deliveredTotal.toFixed(3), saleId },
      }));
      return { deliveryId: delivery.id, orderId: preparation.orderId, saleId };
    });

    await this.trackingService.safeCaptureOrder(transactionResult.orderId, `factory.delivery:${transactionResult.deliveryId}`);
    const delivery = await this.loadDelivery(transactionResult.deliveryId);
    if (!transactionResult.saleId) return { delivery };
    const sale = await this.dataSource.getRepository(Sale).findOneOrFail({ where: { id: transactionResult.saleId } });
    return { delivery, generatedSale: { id: sale.id, code: sale.code, dueDate: sale.dueDate, total: sale.total } };
  }

  async registerVisit(deliveryId: string, dto: RegisterVisitResultDto, actor: AuthenticatedUser): Promise<DistributionRoute & { generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> }> {
    const transactionResult = await this.dataSource.transaction(async (manager) => {
      const delivery = await manager.getRepository(RouteDelivery).createQueryBuilder('delivery')
        .setLock('pessimistic_write', undefined, ['delivery'])
        .leftJoinAndSelect('delivery.route', 'route')
        .leftJoinAndSelect('delivery.preparation', 'preparation')
        .leftJoinAndSelect('preparation.details', 'detail')
        .where('delivery.id = :deliveryId', { deliveryId })
        .getOne();
      if (!delivery) throw new NotFoundException('Entrega de ruta no encontrada');
      if (delivery.deliveryType !== DistributionDeliveryType.ROUTE || !delivery.route || !delivery.routeId) {
        throw new ConflictException('La entrega en fábrica debe completarse desde Pedidos pendientes');
      }
      const route = delivery.route;
      const routeId = delivery.routeId;
      if (route.status !== DistributionRouteStatus.IN_DELIVERY) throw new ConflictException('La ruta no está En reparto');
      await this.assertAssigned(manager, routeId, actor);
      const existing = await manager.getRepository(VisitResult).findOne({ where: { routeDeliveryId: deliveryId } });
      if (existing) throw new ConflictException('La visita ya tiene un resultado registrado');
      if (dto.result !== VisitResultType.DELIVERED && !dto.observation?.trim()) throw new BadRequestException('La entrega parcial o no entregada requiere observación');
      const detailById = new Map(delivery.preparation.details.map((detail) => [detail.id, detail]));
      if (dto.details.length !== detailById.size || new Set(dto.details.map((detail) => detail.preparationDetailId)).size !== detailById.size) {
        throw new BadRequestException('Debe registrar exactamente todos los detalles preparados');
      }
      let deliveredTotal = 0;
      let preparedTotal = 0;
      for (const item of dto.details) {
        const detail = detailById.get(item.preparationDetailId);
        if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la preparación de la entrega');
        const prepared = Number(detail.preparedQuantity);
        if (item.deliveredQuantity + item.returnedQuantity > prepared + 0.0005) throw new BadRequestException('Las cantidades entregada y devuelta no pueden superar la preparada');
        if (Math.abs(item.deliveredQuantity + item.returnedQuantity - prepared) > 0.0005) throw new UnprocessableEntityException('Toda cantidad despachada debe quedar entregada o devuelta');
        deliveredTotal += item.deliveredQuantity;
        preparedTotal += prepared;
      }
      if (dto.result === VisitResultType.DELIVERED && Math.abs(deliveredTotal - preparedTotal) > 0.0005) throw new UnprocessableEntityException('Una entrega completa debe entregar todas las cantidades');
      if (dto.result === VisitResultType.NOT_DELIVERED && deliveredTotal > 0.0005) throw new UnprocessableEntityException('Una visita no entregada no puede registrar cantidades entregadas');
      if (dto.result === VisitResultType.PARTIAL && (deliveredTotal <= 0 || deliveredTotal >= preparedTotal)) throw new UnprocessableEntityException('Una entrega parcial debe registrar una cantidad entregada menor que la preparada');
      const resultRepository = manager.getRepository(VisitResult);
      const result = await resultRepository.save(resultRepository.create({ routeDeliveryId: delivery.id, result: dto.result, userId: actor.id, observation: dto.observation?.trim() || null }));
      for (const item of dto.details) {
        await manager.getRepository(VisitResultDetail).save(manager.getRepository(VisitResultDetail).create({
          visitResultId: result.id,
          preparationDetailId: item.preparationDetailId,
          deliveredQuantity: item.deliveredQuantity.toFixed(3),
          returnedQuantity: item.returnedQuantity.toFixed(3),
          acceptedReturnQuantity: '0.000',
          returnAcceptedById: null,
          returnAcceptedAt: null,
        }));
      }
      delivery.status = RouteDeliveryStatus.VISITED;
      await manager.getRepository(RouteDelivery).save(delivery);
      let saleId: string | null = null;
      if ([VisitResultType.DELIVERED, VisitResultType.PARTIAL].includes(dto.result)) {
        saleId = await this.saleService.createInTransaction(manager, result.id, actor);
        const auditRepository = manager.getRepository(AuditEvent);
        await auditRepository.save(auditRepository.create({
          userId: actor.id,
          module: 'commercial',
          action: 'EMITIR_VENTA_AUTOMATICA',
          entity: 'ventas',
          entityId: saleId,
          result: 'EXITOSO',
          ipAddress: null,
          metadata: { visitResultId: result.id, routeDeliveryId: delivery.id, orderId: delivery.orderId },
        }));
      }
      await this.saveHistory(manager, routeId, route.status, route.status, RouteHistoryEvent.VISIT, actor.id, dto.observation?.trim() || dto.result, { deliveryId, result: dto.result });
      await this.saveAudit(manager, actor.id, 'REGISTRAR_RESULTADO_VISITA', deliveryId, { routeId, result: dto.result, saleId });
      return { routeId, saleId };
    });
    await this.trackingService.safeCaptureRoute(transactionResult.routeId, `route.visit:${deliveryId}`);
    const route = await this.findOne(transactionResult.routeId) as DistributionRoute & { generatedSale?: Pick<Sale, 'id' | 'code' | 'dueDate' | 'total'> };
    if (transactionResult.saleId) {
      const sale = await this.dataSource.getRepository(Sale).findOneOrFail({ where: { id: transactionResult.saleId } });
      route.generatedSale = { id: sale.id, code: sale.code, dueDate: sale.dueDate, total: sale.total };
    }
    return route;
  }

  async finish(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.IN_DELIVERY, 'Solo una ruta En reparto puede finalizarse');
      const deliveries = await manager.getRepository(RouteDelivery).find({
        where: { routeId: id },
        relations: { result: { details: { preparationDetail: true } } },
      });
      if (!deliveries.length || deliveries.some((delivery) => delivery.status !== RouteDeliveryStatus.VISITED)) throw new UnprocessableEntityException('Todas las visitas deben tener un resultado antes de finalizar');
      const returnOrder = await this.createWarehouseReturnOrder(manager, route, deliveries, actor.id);
      route.status = DistributionRouteStatus.FINISHED;
      route.finishedById = actor.id;
      route.finishedAt = new Date();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.IN_DELIVERY, DistributionRouteStatus.FINISHED, RouteHistoryEvent.FINISH, actor.id, dto.observation?.trim() || 'Recorrido finalizado', {
        returnOrderId: returnOrder?.id ?? null,
        returnedQuantity: returnOrder?.expectedQuantity ?? '0.000',
      });
      await this.saveAudit(manager, actor.id, 'FINALIZAR_RUTA', id, { deliveries: deliveries.length, returnOrderId: returnOrder?.id ?? null });
    });
    return this.findOne(id);
  }

  async settle(id: string, dto: SettleRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.FINISHED, 'Solo una ruta Finalizada puede liquidarse');
      const pendingReturn = await manager.getRepository(WarehouseReturnOrder).findOne({ where: { routeId: id, status: WarehouseReturnStatus.PENDING } });
      if (pendingReturn) throw new ConflictException(`La orden de retorno ${pendingReturn.code} debe ser recibida desde Almacén antes de liquidar la ruta`);
      const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id }, relations: { result: { details: { preparationDetail: true } } } });
      if (!deliveries.length || deliveries.some((delivery) => !delivery.result)) throw new UnprocessableEntityException('Todas las visitas deben conservar un resultado');
      const visitDetails = deliveries.flatMap((delivery) => delivery.result?.details ?? []);
      const visitDetailById = new Map(visitDetails.map((detail) => [detail.id, detail]));
      if (new Set(dto.acceptedReturns.map((item) => item.visitDetailId)).size !== dto.acceptedReturns.length) throw new BadRequestException('No puede repetir una devolución');
      let acceptedTotal = 0;
      for (const accepted of dto.acceptedReturns) {
        const visitDetail = visitDetailById.get(accepted.visitDetailId);
        if (!visitDetail) throw new UnprocessableEntityException('La devolución no pertenece a la ruta');
        if (accepted.quantity > Number(visitDetail.returnedQuantity)) throw new BadRequestException('La cantidad aceptada no puede superar la devuelta');
        if (accepted.quantity <= 0) continue;
        const preparationDetail = visitDetail.preparationDetail;
        const stock = await manager.getRepository(Stock).createQueryBuilder('stock').setLock('pessimistic_write').where('stock.id = :id', { id: preparationDetail.stockId }).getOneOrFail();
        const previous = Number(stock.physicalQuantity);
        const next = previous + accepted.quantity;
        stock.physicalQuantity = next.toFixed(3);
        await manager.getRepository(Stock).save(stock);
        const delivery = deliveries.find((candidate) => candidate.result?.id === visitDetail.visitResultId)!;
        await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
          stockId: stock.id,
          type: InventoryMovementType.RETURN_IN,
          quantity: accepted.quantity.toFixed(3),
          previousBalance: previous.toFixed(3),
          newBalance: next.toFixed(3),
          reason: `Devolución aceptada en ${route.code}`,
          userId: actor.id,
          orderId: delivery.orderId,
          orderDetailId: preparationDetail.orderDetailId,
          routeDeliveryId: delivery.id,
        }));
        visitDetail.acceptedReturnQuantity = accepted.quantity.toFixed(3);
        visitDetail.returnAcceptedById = actor.id;
        visitDetail.returnAcceptedAt = new Date();
        await manager.getRepository(VisitResultDetail).save(visitDetail);
        acceptedTotal += accepted.quantity;
      }
      const counts = deliveries.reduce((value, delivery) => {
        if (delivery.result!.result === VisitResultType.DELIVERED) value.complete += 1;
        if (delivery.result!.result === VisitResultType.PARTIAL) value.partial += 1;
        if (delivery.result!.result === VisitResultType.NOT_DELIVERED) value.notDelivered += 1;
        return value;
      }, { complete: 0, partial: 0, notDelivered: 0 });
      await manager.getRepository(RouteSettlement).save(manager.getRepository(RouteSettlement).create({
        routeId: route.id,
        completeDeliveries: counts.complete,
        partialDeliveries: counts.partial,
        notDelivered: counts.notDelivered,
        acceptedReturnQuantity: acceptedTotal.toFixed(3),
        responsibleId: actor.id,
        observation: dto.observation?.trim() || null,
      }));
      route.status = DistributionRouteStatus.SETTLED;
      route.settledById = actor.id;
      route.settledAt = new Date();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.FINISHED, DistributionRouteStatus.SETTLED, RouteHistoryEvent.SETTLEMENT, actor.id, dto.observation?.trim() || 'Liquidación operativa registrada', { ...counts, acceptedReturnQuantity: acceptedTotal });
      await this.saveAudit(manager, actor.id, 'LIQUIDAR_RUTA', id, { ...counts, acceptedReturnQuantity: acceptedTotal });
    });
    return this.findOne(id);
  }

  async warehouseReturns(query: WarehouseReturnQueryDto) {
    const builder = this.dataSource.getRepository(WarehouseReturnOrder).createQueryBuilder('returnOrder')
      .innerJoinAndSelect('returnOrder.route', 'route')
      .innerJoinAndSelect('route.zone', 'zone')
      .innerJoinAndSelect('route.vehicle', 'vehicle')
      .innerJoinAndSelect('returnOrder.createdBy', 'createdBy')
      .leftJoinAndSelect('returnOrder.receivedBy', 'receivedBy')
      .loadRelationCountAndMap('returnOrder.detailCount', 'returnOrder.details')
      .orderBy('returnOrder.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    if (query.status) builder.andWhere('returnOrder.status = :status', { status: query.status });
    if (query.q?.trim()) {
      builder.andWhere('(CAST(returnOrder.code AS text) ILIKE :q OR route.code ILIKE :q OR vehicle.plate ILIKE :q)', { q: `%${query.q.trim()}%` });
    }
    const [items, total] = await builder.getManyAndCount();
    return paginate(items, total, query.page, query.limit);
  }

  async warehouseReturn(id: string): Promise<WarehouseReturnOrder> {
    const item = await this.dataSource.getRepository(WarehouseReturnOrder).findOne({
      where: { id },
      relations: {
        route: { zone: true, vehicle: true },
        createdBy: true,
        receivedBy: true,
        details: {
          stock: { presentation: { product: true, unit: true } },
          visitResultDetail: {
            preparationDetail: { orderDetail: true },
            visitResult: { delivery: { order: { customer: true } } },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Orden de retorno a Almacén no encontrada');
    return item;
  }

  async receiveWarehouseReturn(id: string, dto: ReceiveWarehouseReturnDto, actor: AuthenticatedUser): Promise<WarehouseReturnOrder> {
    await this.dataSource.transaction(async (manager) => {
      const returnOrder = await manager.getRepository(WarehouseReturnOrder).createQueryBuilder('returnOrder')
        .setLock('pessimistic_write')
        .innerJoinAndSelect('returnOrder.route', 'route')
        .where('returnOrder.id = :id', { id })
        .getOne();
      if (!returnOrder) throw new NotFoundException('Orden de retorno a Almacén no encontrada');
      if (returnOrder.status !== WarehouseReturnStatus.PENDING) throw new ConflictException('La orden de retorno ya fue recibida');
      const details = await manager.getRepository(WarehouseReturnOrderDetail).find({
        where: { returnOrderId: id },
        relations: {
          visitResultDetail: {
            preparationDetail: true,
            visitResult: { delivery: true },
          },
        },
      });
      if (dto.details.length !== details.length || new Set(dto.details.map((item) => item.detailId)).size !== details.length) {
        throw new BadRequestException('Debe verificar exactamente todos los productos de la orden de retorno');
      }
      const detailById = new Map(details.map((detail) => [detail.id, detail]));
      let receivedTotal = 0;
      for (const input of dto.details) {
        const detail = detailById.get(input.detailId);
        if (!detail) throw new UnprocessableEntityException('El detalle no pertenece a la orden de retorno');
        const expected = Number(detail.expectedQuantity);
        if (input.quantity > expected + 0.0005) throw new BadRequestException('La cantidad recibida no puede superar la cantidad retornada');
        const visitDetail = detail.visitResultDetail;
        if (input.quantity > 0) {
          const stock = await manager.getRepository(Stock).createQueryBuilder('stock')
            .setLock('pessimistic_write')
            .where('stock.id = :id', { id: detail.stockId })
            .getOneOrFail();
          const previous = Number(stock.physicalQuantity);
          const next = previous + input.quantity;
          stock.physicalQuantity = next.toFixed(3);
          await manager.getRepository(Stock).save(stock);
          await manager.getRepository(InventoryMovement).save(manager.getRepository(InventoryMovement).create({
            stockId: stock.id,
            type: InventoryMovementType.RETURN_IN,
            quantity: input.quantity.toFixed(3),
            previousBalance: previous.toFixed(3),
            newBalance: next.toFixed(3),
            reason: `Recepción de retorno N.º ${returnOrder.code} · ${returnOrder.route.code}`,
            userId: actor.id,
            orderId: visitDetail.visitResult.delivery.orderId,
            orderDetailId: visitDetail.preparationDetail.orderDetailId,
            routeDeliveryId: visitDetail.visitResult.delivery.id,
          }));
        }
        detail.receivedQuantity = input.quantity.toFixed(3);
        await manager.getRepository(WarehouseReturnOrderDetail).save(detail);
        visitDetail.acceptedReturnQuantity = input.quantity.toFixed(3);
        visitDetail.returnAcceptedById = actor.id;
        visitDetail.returnAcceptedAt = new Date();
        await manager.getRepository(VisitResultDetail).save(visitDetail);
        receivedTotal += input.quantity;
      }
      if (Math.abs(receivedTotal - Number(returnOrder.expectedQuantity)) > 0.0005 && !dto.observation?.trim()) {
        throw new BadRequestException('Una recepción con diferencia requiere observación');
      }

      const routeDeliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: returnOrder.routeId }, relations: { result: true } });
      const counts = routeDeliveries.reduce((value, delivery) => {
        if (delivery.result?.result === VisitResultType.DELIVERED) value.complete += 1;
        if (delivery.result?.result === VisitResultType.PARTIAL) value.partial += 1;
        if (delivery.result?.result === VisitResultType.NOT_DELIVERED) value.notDelivered += 1;
        return value;
      }, { complete: 0, partial: 0, notDelivered: 0 });
      await manager.getRepository(RouteSettlement).save(manager.getRepository(RouteSettlement).create({
        routeId: returnOrder.routeId,
        completeDeliveries: counts.complete,
        partialDeliveries: counts.partial,
        notDelivered: counts.notDelivered,
        acceptedReturnQuantity: receivedTotal.toFixed(3),
        responsibleId: actor.id,
        observation: dto.observation?.trim() || null,
      }));
      returnOrder.status = WarehouseReturnStatus.RECEIVED;
      returnOrder.receivedQuantity = receivedTotal.toFixed(3);
      returnOrder.receivedById = actor.id;
      returnOrder.receivedAt = new Date();
      returnOrder.observation = dto.observation?.trim() || null;
      await manager.getRepository(WarehouseReturnOrder).save(returnOrder);
      returnOrder.route.status = DistributionRouteStatus.SETTLED;
      returnOrder.route.settledById = actor.id;
      returnOrder.route.settledAt = new Date();
      await manager.getRepository(DistributionRoute).save(returnOrder.route);
      await this.saveHistory(manager, returnOrder.routeId, DistributionRouteStatus.FINISHED, DistributionRouteStatus.SETTLED, RouteHistoryEvent.SETTLEMENT, actor.id, dto.observation?.trim() || `Retorno N.º ${returnOrder.code} recibido por Almacén`, { ...counts, returnOrderId: returnOrder.id, expectedQuantity: returnOrder.expectedQuantity, receivedQuantity: receivedTotal.toFixed(3) });
      await this.saveAudit(manager, actor.id, 'RECIBIR_RETORNO_ALMACEN', returnOrder.routeId, { returnOrderId: returnOrder.id, expectedQuantity: returnOrder.expectedQuantity, receivedQuantity: receivedTotal.toFixed(3) });
    });
    return this.warehouseReturn(id);
  }

  async history(id: string): Promise<RouteHistory[]> {
    await this.findOne(id);
    return this.historyRepository.find({ where: { routeId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }

  private applyFilters(builder: ReturnType<Repository<DistributionRoute>['createQueryBuilder']>, query: DistributionRouteQueryDto): void {
    if (query.date) builder.andWhere('route.date = :date', { date: query.date });
    if (query.zoneId) builder.andWhere('route.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.vehicleId) builder.andWhere('route.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (query.status) builder.andWhere('route.status = :status', { status: query.status });
    if (query.q?.trim()) {
      builder.andWhere('(route.code ILIKE :query OR zone.name ILIKE :query OR vehicle.plate ILIKE :query)', { query: `%${query.q.trim()}%` });
    }
  }

  private async loadDelivery(id: string): Promise<RouteDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: {
        order: { customer: true },
        address: { zone: true },
        preparation: true,
        result: { user: true, details: { preparationDetail: true } },
      },
    });
    if (!delivery) throw new NotFoundException('Entrega no encontrada');
    const preparation = await this.dataSource.getRepository(OrderPreparation).findOne({
      where: { id: delivery.preparationId },
      relations: {
        details: {
          orderDetail: { presentation: { product: true, unit: true } },
          stock: true,
        },
      },
    });
    if (preparation) delivery.preparation = preparation;
    if (delivery.result) {
      const detailById = new Map((preparation?.details ?? []).map((detail) => [detail.id, detail]));
      for (const resultDetail of delivery.result.details) {
        const completeDetail = detailById.get(resultDetail.preparationDetailId);
        if (completeDetail) resultDetail.preparationDetail = completeDetail;
      }
    }
    return delivery;
  }

  private async loadDeliveries(routeId: string): Promise<RouteDelivery[]> {
    const deliveries = await this.deliveryRepository.find({
      where: { routeId },
      relations: {
        order: { customer: true },
        address: { zone: true },
        preparation: true,
        result: { user: true, details: { preparationDetail: true } },
      },
      order: { position: 'ASC' },
    });
    const preparationIds = [...new Set(deliveries.map((delivery) => delivery.preparationId))];
    if (!preparationIds.length) return deliveries;
    const preparations = await this.dataSource.getRepository(OrderPreparation).find({
      where: { id: In(preparationIds) },
      relations: {
        details: {
          orderDetail: { presentation: { product: true, unit: true } },
          stock: true,
        },
      },
    });
    const preparationById = new Map(preparations.map((preparation) => [preparation.id, preparation]));
    for (const delivery of deliveries) {
      const preparation = preparationById.get(delivery.preparationId);
      if (preparation) delivery.preparation = preparation;
      if (delivery.result) {
        const detailById = new Map((preparation?.details ?? []).map((detail) => [detail.id, detail]));
        for (const resultDetail of delivery.result.details) {
          const completeDetail = detailById.get(resultDetail.preparationDetailId);
          if (completeDetail) resultDetail.preparationDetail = completeDetail;
        }
      }
    }
    return deliveries;
  }

  private async createWarehouseReturnOrder(
    manager: EntityManager,
    route: DistributionRoute,
    deliveries: RouteDelivery[],
    actorId: string,
  ): Promise<WarehouseReturnOrder | null> {
    const returnedDetails = deliveries
      .flatMap((delivery) => delivery.result?.details ?? [])
      .filter((detail) => Number(detail.returnedQuantity) > 0);
    if (!returnedDetails.length) return null;
    const existing = await manager.getRepository(WarehouseReturnOrder).findOne({ where: { routeId: route.id } });
    if (existing) return existing;
    const expectedTotal = returnedDetails.reduce((sum, detail) => sum + Number(detail.returnedQuantity), 0);
    const returnOrderRepository = manager.getRepository(WarehouseReturnOrder);
    const returnOrder = await returnOrderRepository.save(returnOrderRepository.create({
      routeId: route.id,
      status: WarehouseReturnStatus.PENDING,
      expectedQuantity: expectedTotal.toFixed(3),
      receivedQuantity: '0.000',
      createdById: actorId,
      receivedById: null,
      receivedAt: null,
      observation: null,
    }));
    const detailRepository = manager.getRepository(WarehouseReturnOrderDetail);
    for (const visitDetail of returnedDetails) {
      await detailRepository.save(detailRepository.create({
        returnOrderId: returnOrder.id,
        visitResultDetailId: visitDetail.id,
        stockId: visitDetail.preparationDetail.stockId,
        expectedQuantity: Number(visitDetail.returnedQuantity).toFixed(3),
        receivedQuantity: '0.000',
      }));
    }
    const auditRepository = manager.getRepository(AuditEvent);
    await auditRepository.save(auditRepository.create({
      userId: actorId,
      module: 'inventory',
      action: 'GENERAR_ORDEN_RETORNO_ALMACEN',
      entity: 'ordenes_retorno_almacen',
      entityId: returnOrder.id,
      result: 'EXITOSO',
      ipAddress: null,
      metadata: { routeId: route.id, expectedQuantity: returnOrder.expectedQuantity, detailCount: returnedDetails.length },
    }));
    return returnOrder;
  }

  private async lockRoute(manager: EntityManager, id: string): Promise<DistributionRoute> {
    const route = await manager.getRepository(DistributionRoute).createQueryBuilder('route').setLock('pessimistic_write').where('route.id = :id', { id }).getOne();
    if (!route) throw new NotFoundException('Ruta de distribución no encontrada');
    return route;
  }

  private assertRouteStatus(route: DistributionRoute, expected: DistributionRouteStatus, message: string): void {
    if (route.status !== expected) throw new ConflictException(message);
  }

  private async assertResourceAvailability(manager: EntityManager, date: string, vehicleId: string, userIds: string[], exceptRouteId?: string): Promise<void> {
    const parameters: unknown[] = [date, vehicleId, userIds, ACTIVE_ROUTE_STATUSES];
    let exception = '';
    if (exceptRouteId) {
      parameters.push(exceptRouteId);
      exception = 'AND route.id <> $5';
    }
    const conflicts = await manager.query<{ code: string }[]>(`
      SELECT DISTINCT route.codigo AS code
        FROM rutas_distribucion route
        LEFT JOIN rutas_responsables responsible ON responsible.ruta_id = route.id
       WHERE route.fecha = $1
         AND route.estado = ANY($4::estado_ruta_enum[])
         AND (route.vehiculo_id = $2 OR responsible.usuario_id = ANY($3::uuid[]))
         ${exception}
       LIMIT 1
    `, parameters);
    if (conflicts.length) throw new ConflictException(`El vehículo o un responsable ya está asignado a ${conflicts[0].code} en la misma jornada`);
  }

  private async assignPreparations(
    manager: EntityManager,
    route: DistributionRoute,
    preparationIds: string[],
    actorId: string,
  ): Promise<void> {
    const uniqueIds = [...new Set(preparationIds)];
    if (uniqueIds.length !== preparationIds.length) throw new BadRequestException('No puede repetir una preparación');
    const currentPosition = await manager.getRepository(RouteDelivery).createQueryBuilder('delivery')
      .select('COALESCE(MAX(delivery.position), 0)', 'position')
      .where('delivery.routeId = :routeId', { routeId: route.id })
      .getRawOne<{ position: number | string }>();
    let position = Number(currentPosition?.position ?? 0);
    for (const preparationId of uniqueIds) {
      const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
        .setLock('pessimistic_write', undefined, ['preparation'])
        .leftJoinAndSelect('preparation.order', 'orders')
        .leftJoinAndSelect('orders.address', 'address')
        .where('preparation.id = :preparationId', { preparationId })
        .getOne();
      if (!preparation) throw new NotFoundException('Preparación no encontrada');
      if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación confirmada puede agregarse a la ruta');
      if (!preparation.handedOffAt) throw new ConflictException('Almacén debe entregar la preparación a Distribución antes de asignarla a una ruta');
      if (preparation.order.address.zoneId !== route.zoneId) {
        throw new UnprocessableEntityException('Todos los pedidos seleccionados deben corresponder a la zona de la ruta');
      }
      const assigned = await manager.getRepository(RouteDelivery).findOne({ where: { preparationId } });
      if (assigned) throw new ConflictException('La preparación ya pertenece a otra ruta');
      position += 1;
      await manager.getRepository(RouteDelivery).save(manager.getRepository(RouteDelivery).create({
        routeId: route.id,
        deliveryType: DistributionDeliveryType.ROUTE,
        preparationId,
        orderId: preparation.orderId,
        addressId: preparation.order.addressId,
        position,
        status: RouteDeliveryStatus.PENDING,
      }));
      preparation.status = PreparationStatus.ASSIGNED;
      await manager.getRepository(OrderPreparation).save(preparation);
      await this.savePreparationHistory(manager, preparation.id, PreparationStatus.PREPARED, PreparationStatus.ASSIGNED, PreparationEvent.ASSIGNMENT, actorId, `Asignada a ${route.code}`);
    }
  }

  private async routeLoad(manager: EntityManager, routeId: string): Promise<{ loadWeightKg: number; missingWeightPresentations: string[] }> {
    const rows = await manager.query<Array<{ load_weight_kg: string; missing_weights: string[] | null }>>(`
      SELECT COALESCE(SUM(detail.cantidad_preparada * COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion))
               FILTER (WHERE COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion) IS NOT NULL), 0)::text AS load_weight_kg,
             array_agg(DISTINCT product.nombre || ' · ' || presentation.descripcion)
               FILTER (WHERE detail.cantidad_preparada > 0 AND COALESCE(presentation.peso_kg, unit.factor_kg * presentation.factor_conversion) IS NULL) AS missing_weights
        FROM rutas_entregas delivery
        JOIN preparaciones_detalle detail ON detail.preparacion_id = delivery.preparacion_id
        JOIN pedidos_detalle order_detail ON order_detail.id = detail.detalle_pedido_id
        JOIN presentaciones_producto presentation ON presentation.id = order_detail.presentacion_id
        JOIN unidades_medida unit ON unit.id = presentation.unidad_id
        JOIN productos product ON product.id = presentation.producto_id
       WHERE delivery.ruta_id = $1
    `, [routeId]);
    return {
      loadWeightKg: Number(rows[0]?.load_weight_kg ?? 0),
      missingWeightPresentations: rows[0]?.missing_weights ?? [],
    };
  }

  private async attachLoadMetrics(route: DistributionRoute): Promise<void> {
    const load = await this.routeLoad(this.dataSource.manager, route.id);
    const capacity = Number(route.vehicle?.capacityKg ?? 0);
    route.loadWeightKg = load.loadWeightKg.toFixed(3);
    route.capacityExceeded = capacity > 0 && load.loadWeightKg > capacity + 0.0005;
    route.excessWeightKg = Math.max(0, load.loadWeightKg - capacity).toFixed(3);
    route.missingWeightPresentations = load.missingWeightPresentations;
  }

  private async assertVehicleCapacity(manager: EntityManager, routeId: string, vehicle: Vehicle): Promise<void> {
    if (!vehicle.capacityKg || Number(vehicle.capacityKg) <= 0) {
      throw new UnprocessableEntityException('El vehículo no tiene una capacidad válida en kg; edítelo antes de continuar');
    }
    const load = await this.routeLoad(manager, routeId);
    if (load.missingWeightPresentations.length) {
      throw new UnprocessableEntityException(`No se puede calcular la carga: configure el peso en kg de ${load.missingWeightPresentations.join(', ')}`);
    }
    const capacity = Number(vehicle.capacityKg);
    if (load.loadWeightKg > capacity + 0.0005) {
      const excess = load.loadWeightKg - capacity;
      throw new UnprocessableEntityException(`La carga de ${load.loadWeightKg.toFixed(3)} kg supera la capacidad de ${capacity.toFixed(3)} kg por ${excess.toFixed(3)} kg; cambie el vehículo antes de continuar`);
    }
  }

  private async assertAssigned(manager: EntityManager, routeId: string, actor: AuthenticatedUser): Promise<void> {
    if (this.canControlAllDeliveries(actor)) return;
    const assignment = await manager.getRepository(RouteResponsible).findOne({ where: { routeId, userId: actor.id } });
    if (!assignment) throw new ForbiddenException('Solo un responsable asignado puede registrar la visita');
  }

  private canControlAllDeliveries(actor: AuthenticatedUser): boolean {
    return actor.roles.some((role) => role === 'ADMINISTRADOR' || role === 'COMERCIALIZACION');
  }

  private validCoordinates(latitude: string | null, longitude: string | null): boolean {
    if (latitude === null || longitude === null) return false;
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  private async saveHistory(manager: EntityManager, routeId: string, previousStatus: DistributionRouteStatus | null, newStatus: DistributionRouteStatus, event: RouteHistoryEvent, userId: string, observation: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const repository = manager.getRepository(RouteHistory);
    await repository.save(repository.create({ routeId, previousStatus, newStatus, event, userId, observation, metadata }));
  }

  private async savePreparationHistory(manager: EntityManager, preparationId: string, previousStatus: PreparationStatus, newStatus: PreparationStatus, event: PreparationEvent, userId: string, observation: string): Promise<void> {
    const repository = manager.getRepository(PreparationHistory);
    await repository.save(repository.create({ preparationId, previousStatus, newStatus, event, userId, observation, metadata: {} }));
  }

  private async saveAudit(manager: EntityManager, userId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    const repository = manager.getRepository(AuditEvent);
    await repository.save(repository.create({ userId, module: 'distribution', action, entity: 'rutas_distribucion', entityId, result: 'EXITOSO', ipAddress: null, metadata }));
  }
}
