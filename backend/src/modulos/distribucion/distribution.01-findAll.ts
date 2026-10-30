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
import { DistributionServiceParte02 } from './distribution.02-updatePresentationWeights';

export abstract class DistributionServiceParte01 extends DistributionServiceParte02 {
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
}
