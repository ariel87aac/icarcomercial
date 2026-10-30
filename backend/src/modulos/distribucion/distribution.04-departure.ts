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
import { DistributionServiceParte05 } from './distribution.05-completeFactoryDelivery';

export abstract class DistributionServiceParte04 extends DistributionServiceParte05 {
  async departure(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
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
      await this.trackingService.refreshStock(`stock.distribution:${randomUUID()}`);
      await this.trackingService.safeCaptureRoute(id, `route.departure:${id}`);
      return this.findOne(id);
    }
}
