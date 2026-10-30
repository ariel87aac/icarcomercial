import { workflowTransaction } from '../pedidos/order-workflow';
import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductPresentation } from '../productos/catalogo/entidades/product-presentation.entity';
import { SaleService } from '../ventas-cobranzas/sale.service';
import { Sale } from '../ventas-cobranzas/entidades/sale.entity';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { InventoryMovementType, InventoryReservationStatus } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderPreparationDetail } from '../preparacion/entidades/order-preparation-detail.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationHistory } from '../preparacion/entidades/preparation-history.entity';
import { PreparationEvent, PreparationStatus } from '../preparacion/entidades/preparation.enums';
import { User } from '../seguridad/usuarios/entidades/user.entity';
import { Zone } from '../zonas-reparto/entidades/zone.entity';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
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
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionDeliveryType, DistributionRouteStatus, RouteDeliveryStatus, RouteHistoryEvent, RouteResponsibleFunction, VisitResultType, WarehouseReturnStatus } from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { RouteHistory } from './entidades/route-history.entity';
import { RouteResponsible } from './entidades/route-responsible.entity';
import { RouteSettlement } from './entidades/route-settlement.entity';
import { VisitResultDetail } from './entidades/visit-result-detail.entity';
import { VisitResult } from './entidades/visit-result.entity';
import { WarehouseReturnOrderDetail } from './entidades/warehouse-return-order-detail.entity';
import { WarehouseReturnOrder } from './entidades/warehouse-return-order.entity';

const ACTIVE_ROUTE_STATUSES = [
  DistributionRouteStatus.DRAFT,
  DistributionRouteStatus.PLANNED,
  DistributionRouteStatus.IN_DELIVERY,
];
import { DistributionServiceParte04 } from './distribution.04-departure';

export abstract class DistributionServiceParte03 extends DistributionServiceParte04 {
  async reschedule(id: string, dto: RescheduleRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
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
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureRoute(id, `route.rescheduled:${id}:${dto.date}`);
      return this.findOne(id);
    }

  async cancel(id: string, dto: CancelRouteDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      const orderIds = await workflowTransaction(this.dataSource, async (manager) => {
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
      await workflowTransaction(this.dataSource, async (manager) => {
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
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureRoute(id, `route.sequence:${id}:${Date.now()}`);
      return this.findOne(id);
    }

  async plan(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
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
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureRoute(id, `route.planned:${id}`);
      return this.findOne(id);
    }
}
