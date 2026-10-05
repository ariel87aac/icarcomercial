import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../common/dto/pagination-query.dto';
import { RecordStatus } from '../../common/enums/record-status.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditEvent } from '../audit/entities/audit-event.entity';
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
import {
  AddRouteDeliveriesDto,
  CreateDistributionRouteDto,
  DistributionRouteQueryDto,
  RegisterVisitResultDto,
  RouteTransitionDto,
  SettleRouteDto,
  UpdateRouteSequenceDto,
} from './dto/distribution.dto';
import { DistributionRoute } from './entities/distribution-route.entity';
import { DistributionRouteStatus, RouteDeliveryStatus, RouteHistoryEvent, RouteResponsibleFunction, VisitResultType } from './entities/distribution.enums';
import { RouteDelivery } from './entities/route-delivery.entity';
import { RouteHistory } from './entities/route-history.entity';
import { RouteResponsible } from './entities/route-responsible.entity';
import { RouteSettlement } from './entities/route-settlement.entity';
import { VisitResultDetail } from './entities/visit-result-detail.entity';
import { VisitResult } from './entities/visit-result.entity';

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
    private readonly dataSource: DataSource,
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
    const routes = await this.routeRepository.createQueryBuilder('route')
      .innerJoin('route.responsibles', 'scope', 'scope.userId = :userId', { userId: actor.id })
      .where('route.status IN (:...statuses)', { statuses: [DistributionRouteStatus.PLANNED, DistributionRouteStatus.IN_DELIVERY] })
      .orderBy('route.date', 'ASC')
      .getMany();
    return Promise.all(routes.map((route) => this.findOne(route.id)));
  }

  async create(dto: CreateDistributionRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    const id = await this.dataSource.transaction(async (manager) => {
      const zone = await manager.getRepository(Zone).findOne({ where: { id: dto.zoneId, status: RecordStatus.ACTIVE } });
      if (!zone) throw new NotFoundException('Zona no encontrada o inactiva');
      const vehicle = await manager.getRepository(Vehicle).findOne({ where: { id: dto.vehicleId, status: RecordStatus.ACTIVE } });
      if (!vehicle) throw new UnprocessableEntityException('El vehículo debe estar activo');
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
      await this.saveAudit(manager, actor.id, 'CREAR_RUTA', route.id, { date: route.date, zoneId: route.zoneId, vehicleId: route.vehicleId });
      return route.id;
    });
    return this.findOne(id);
  }

  async addDeliveries(id: string, dto: AddRouteDeliveriesDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.DRAFT, 'Solo una ruta en Borrador admite pedidos');
      const preparationIds = [...new Set(dto.preparationIds)];
      if (preparationIds.length !== dto.preparationIds.length) throw new BadRequestException('No puede repetir una preparación');
      for (const preparationId of preparationIds) {
        const preparation = await manager.getRepository(OrderPreparation).createQueryBuilder('preparation')
          .setLock('pessimistic_write', undefined, ['preparation'])
          .leftJoinAndSelect('preparation.order', 'orders')
          .leftJoinAndSelect('orders.address', 'address')
          .where('preparation.id = :preparationId', { preparationId })
          .getOne();
        if (!preparation) throw new NotFoundException('Preparación no encontrada');
        if (preparation.status !== PreparationStatus.PREPARED) throw new ConflictException('Solo una preparación confirmada puede agregarse a la ruta');
        if (preparation.order.requestedDate !== route.date || preparation.order.address.zoneId !== route.zoneId) {
          throw new UnprocessableEntityException('La preparación no corresponde a la fecha y zona de la ruta');
        }
        const assigned = await manager.getRepository(RouteDelivery).findOne({ where: { preparationId } });
        if (assigned) throw new ConflictException('La preparación ya pertenece a otra ruta');
        await manager.getRepository(RouteDelivery).save(manager.getRepository(RouteDelivery).create({
          routeId: route.id,
          preparationId,
          orderId: preparation.orderId,
          addressId: preparation.order.addressId,
          position: null,
          status: RouteDeliveryStatus.PENDING,
        }));
        preparation.status = PreparationStatus.ASSIGNED;
        await manager.getRepository(OrderPreparation).save(preparation);
        await this.savePreparationHistory(manager, preparation.id, PreparationStatus.PREPARED, PreparationStatus.ASSIGNED, PreparationEvent.ASSIGNMENT, actor.id, `Asignada a ${route.code}`);
      }
      await this.saveHistory(manager, route.id, route.status, route.status, RouteHistoryEvent.ASSIGNMENT, actor.id, 'Preparaciones agregadas a la ruta', { preparationIds });
      await this.saveAudit(manager, actor.id, 'ASIGNAR_ENTREGAS_RUTA', route.id, { preparationIds });
    });
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
      route.status = DistributionRouteStatus.PLANNED;
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED, RouteHistoryEvent.PLANNING, actor.id, dto.observation?.trim() || 'Ruta planificada');
      await this.saveAudit(manager, actor.id, 'PLANIFICAR_RUTA', id, { deliveries: deliveries.length });
    });
    return this.findOne(id);
  }

  async departure(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.PLANNED, 'La salida solo puede registrarse desde una ruta Planificada');
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
          if (nextReserved < -0.0005 || next < nextReserved) throw new ConflictException('Los saldos reservados cambiaron durante el despacho');
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
    return this.findOne(id);
  }

  async registerVisit(deliveryId: string, dto: RegisterVisitResultDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    const routeId = await this.dataSource.transaction(async (manager) => {
      const delivery = await manager.getRepository(RouteDelivery).createQueryBuilder('delivery')
        .setLock('pessimistic_write', undefined, ['delivery'])
        .leftJoinAndSelect('delivery.route', 'route')
        .leftJoinAndSelect('delivery.preparation', 'preparation')
        .leftJoinAndSelect('preparation.details', 'detail')
        .where('delivery.id = :deliveryId', { deliveryId })
        .getOne();
      if (!delivery) throw new NotFoundException('Entrega de ruta no encontrada');
      if (delivery.route.status !== DistributionRouteStatus.IN_DELIVERY) throw new ConflictException('La ruta no está En reparto');
      await this.assertAssigned(manager, delivery.routeId, actor);
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
      await this.saveHistory(manager, delivery.routeId, delivery.route.status, delivery.route.status, RouteHistoryEvent.VISIT, actor.id, dto.observation?.trim() || dto.result, { deliveryId, result: dto.result });
      await this.saveAudit(manager, actor.id, 'REGISTRAR_RESULTADO_VISITA', deliveryId, { routeId: delivery.routeId, result: dto.result });
      return delivery.routeId;
    });
    return this.findOne(routeId);
  }

  async finish(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.IN_DELIVERY, 'Solo una ruta En reparto puede finalizarse');
      const deliveries = await manager.getRepository(RouteDelivery).find({ where: { routeId: id } });
      if (!deliveries.length || deliveries.some((delivery) => delivery.status !== RouteDeliveryStatus.VISITED)) throw new UnprocessableEntityException('Todas las visitas deben tener un resultado antes de finalizar');
      route.status = DistributionRouteStatus.FINISHED;
      route.finishedById = actor.id;
      route.finishedAt = new Date();
      await manager.getRepository(DistributionRoute).save(route);
      await this.saveHistory(manager, id, DistributionRouteStatus.IN_DELIVERY, DistributionRouteStatus.FINISHED, RouteHistoryEvent.FINISH, actor.id, dto.observation?.trim() || 'Recorrido finalizado');
      await this.saveAudit(manager, actor.id, 'FINALIZAR_RUTA', id, { deliveries: deliveries.length });
    });
    return this.findOne(id);
  }

  async settle(id: string, dto: SettleRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
    await this.dataSource.transaction(async (manager) => {
      const route = await this.lockRoute(manager, id);
      this.assertRouteStatus(route, DistributionRouteStatus.FINISHED, 'Solo una ruta Finalizada puede liquidarse');
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

  async history(id: string): Promise<RouteHistory[]> {
    await this.findOne(id);
    return this.historyRepository.find({ where: { routeId: id }, relations: { user: true }, order: { occurredAt: 'ASC' } });
  }

  private applyFilters(builder: ReturnType<Repository<DistributionRoute>['createQueryBuilder']>, query: DistributionRouteQueryDto): void {
    if (query.date) builder.andWhere('route.date = :date', { date: query.date });
    if (query.zoneId) builder.andWhere('route.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.vehicleId) builder.andWhere('route.vehicleId = :vehicleId', { vehicleId: query.vehicleId });
    if (query.status) builder.andWhere('route.status = :status', { status: query.status });
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

  private async assertAssigned(manager: EntityManager, routeId: string, actor: AuthenticatedUser): Promise<void> {
    if (actor.roles.includes('ADMINISTRADOR')) return;
    const assignment = await manager.getRepository(RouteResponsible).findOne({ where: { routeId, userId: actor.id } });
    if (!assignment) throw new ForbiddenException('Solo un responsable asignado puede registrar la visita');
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
