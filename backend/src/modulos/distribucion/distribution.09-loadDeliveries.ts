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
import { DistributionServiceParte10 } from './distribution.10-routeLoad';

export abstract class DistributionServiceParte09 extends DistributionServiceParte10 {
  protected async loadDeliveries(routeId: string): Promise<RouteDelivery[]> {
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

  protected async createWarehouseReturnOrder(
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

  protected async lockRoute(manager: EntityManager, id: string): Promise<DistributionRoute> {
      const route = await manager.getRepository(DistributionRoute).createQueryBuilder('route').setLock('pessimistic_write').where('route.id = :id', { id }).getOne();
      if (!route) throw new NotFoundException('Ruta de distribución no encontrada');
      return route;
    }

  protected assertRouteStatus(route: DistributionRoute, expected: DistributionRouteStatus, message: string): void {
      if (route.status !== expected) throw new ConflictException(message);
    }

  protected async assertResourceAvailability(manager: EntityManager, date: string, vehicleId: string, userIds: string[], exceptRouteId?: string): Promise<void> {
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

  protected async assignPreparations(
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
}
