import { workflowTransaction } from '../pedidos/order-workflow';
import { randomUUID } from 'node:crypto';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { Vehicle } from './flota/entidades/vehicle.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryReservation } from '../almacen/entidades/inventory-reservation.entity';
import { InventoryMovementType, InventoryReservationStatus } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { OrderPreparation } from '../preparacion/entidades/order-preparation.entity';
import { PreparationEvent, PreparationStatus } from '../preparacion/entidades/preparation.enums';
import { RouteTransitionDto } from './dto/distribution.dto';
import { DistributionRoute } from './entidades/distribution-route.entity';
import { DistributionRouteStatus, RouteHistoryEvent, VehicleDispatchStatus } from './entidades/distribution.enums';
import { RouteDelivery } from './entidades/route-delivery.entity';
import { VehicleDispatch } from './entidades/vehicle-dispatch.entity';
import { DistributionServiceParte05 } from './distribution.05-completeFactoryDelivery';

export abstract class DistributionServiceParte04 extends DistributionServiceParte05 {
  async departure(id: string, dto: RouteTransitionDto, actor: AuthenticatedUser): Promise<DistributionRoute> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const route = await this.lockRoute(manager, id);
        this.assertRouteStatus(route, DistributionRouteStatus.PLANNED, 'La salida solo puede registrarse desde una ruta Planificada');
        await this.assertAssigned(manager, id, actor);
        if (route.vehicleDispatchId) {
          const activeDispatch = await manager.getRepository(VehicleDispatch).exists({ where: { id: route.vehicleDispatchId, status: VehicleDispatchStatus.ACTIVE } });
          if (!activeDispatch) throw new ConflictException('El despacho del vehículo ya no está activo');
        }
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
