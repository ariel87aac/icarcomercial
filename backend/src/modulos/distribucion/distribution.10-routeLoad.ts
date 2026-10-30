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
import { DistributionServiceBase } from './distribution.base';

export abstract class DistributionServiceParte10 extends DistributionServiceBase {
  protected async routeLoad(manager: EntityManager, routeId: string): Promise<{ loadWeightKg: number; missingWeightPresentations: string[] }> {
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

  protected async attachLoadMetrics(route: DistributionRoute): Promise<void> {
      const load = await this.routeLoad(this.dataSource.manager, route.id);
      const capacity = Number(route.vehicle?.capacityKg ?? 0);
      route.loadWeightKg = load.loadWeightKg.toFixed(3);
      route.capacityExceeded = capacity > 0 && load.loadWeightKg > capacity + 0.0005;
      route.excessWeightKg = Math.max(0, load.loadWeightKg - capacity).toFixed(3);
      route.missingWeightPresentations = load.missingWeightPresentations;
    }

  protected async assertVehicleCapacity(manager: EntityManager, routeId: string, vehicle: Vehicle): Promise<void> {
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

  protected async assertAssigned(manager: EntityManager, routeId: string, actor: AuthenticatedUser): Promise<void> {
      if (this.canControlAllDeliveries(actor)) return;
      const assignment = await manager.getRepository(RouteResponsible).findOne({ where: { routeId, userId: actor.id } });
      if (!assignment) throw new ForbiddenException('Solo un responsable asignado puede registrar la visita');
    }

  protected canControlAllDeliveries(actor: AuthenticatedUser): boolean {
      return actor.roles.some((role) => role === 'ADMINISTRADOR' || role === 'COMERCIALIZACION');
    }

  protected validCoordinates(latitude: string | null, longitude: string | null): boolean {
      if (latitude === null || longitude === null) return false;
      const lat = Number(latitude);
      const lng = Number(longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

  protected async saveHistory(manager: EntityManager, routeId: string, previousStatus: DistributionRouteStatus | null, newStatus: DistributionRouteStatus, event: RouteHistoryEvent, userId: string, observation: string, metadata: Record<string, unknown> = {}): Promise<void> {
      const repository = manager.getRepository(RouteHistory);
      await repository.save(repository.create({ routeId, previousStatus, newStatus, event, userId, observation, metadata }));
    }

  protected async savePreparationHistory(manager: EntityManager, preparationId: string, previousStatus: PreparationStatus, newStatus: PreparationStatus, event: PreparationEvent, userId: string, observation: string): Promise<void> {
      const repository = manager.getRepository(PreparationHistory);
      await repository.save(repository.create({ preparationId, previousStatus, newStatus, event, userId, observation, metadata: {} }));
    }

  protected async saveAudit(manager: EntityManager, userId: string, action: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
      const repository = manager.getRepository(AuditEvent);
      await repository.save(repository.create({ userId, module: 'distribution', action, entity: 'rutas_distribucion', entityId, result: 'EXITOSO', ipAddress: null, metadata }));
    }
}
