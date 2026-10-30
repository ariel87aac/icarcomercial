import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { DistributionRouteStatus, RouteDeliveryStatus } from '../distribution/entities/distribution.enums';
import { RouteDelivery } from '../distribution/entities/route-delivery.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderStatus } from '../orders/entities/order.enums';
import { OrderPreparation } from '../preparation/entities/order-preparation.entity';
import { PreparationStatus } from '../preparation/entities/preparation.enums';
import { ProductionConsolidation } from '../production/entities/production-consolidation.entity';
import { ProductionConsolidationStatus } from '../production/entities/production.enums';
import { UserType } from '../users/entities/user-type.enum';

interface OperationalStage<TBreakdown extends Record<string, number>> {
  available: boolean;
  pending: number;
  breakdown: TBreakdown;
}

export interface OperationalDashboardSummary {
  pendingTotal: number;
  generatedAt: string;
  stages: {
    orders: OperationalStage<{ draft: number; received: number }>;
    production: OperationalStage<{ draft: number; issued: number; inProgress: number }>;
    preparation: OperationalStage<{ notStarted: number; inProgress: number; observed: number }>;
    distribution: OperationalStage<{ readyForRoute: number; scheduled: number; inDelivery: number }>;
  };
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(ProductionConsolidation) private readonly productionRepository: Repository<ProductionConsolidation>,
    @InjectRepository(OrderPreparation) private readonly preparationRepository: Repository<OrderPreparation>,
    @InjectRepository(RouteDelivery) private readonly deliveryRepository: Repository<RouteDelivery>,
  ) {}

  async operationalSummary(actor: AuthenticatedUser): Promise<OperationalDashboardSummary> {
    const [orders, production, preparation, distribution] = await Promise.all([
      this.orderStage(actor),
      this.productionStage(actor),
      this.preparationStage(actor),
      this.distributionStage(actor),
    ]);
    return {
      pendingTotal: orders.pending + production.pending + preparation.pending + distribution.pending,
      generatedAt: new Date().toISOString(),
      stages: { orders, production, preparation, distribution },
    };
  }

  private async orderStage(actor: AuthenticatedUser): Promise<OperationalDashboardSummary['stages']['orders']> {
    const breakdown = { draft: 0, received: 0 };
    if (!this.can(actor, 'orders.read')) return { available: false, pending: 0, breakdown };
    const builder = this.orderRepository.createQueryBuilder('customer_order')
      .select('customer_order.status', 'status')
      .addSelect('COUNT(customer_order.id)::integer', 'count')
      .where('customer_order.status IN (:...statuses)', { statuses: [OrderStatus.DRAFT, OrderStatus.RECEIVED] })
      .groupBy('customer_order.status');
    this.applyCustomerScope(builder, actor, 'customer_order');
    const rows = await builder.getRawMany<{ status: OrderStatus; count: number | string }>();
    for (const row of rows) {
      if (row.status === OrderStatus.DRAFT) breakdown.draft = Number(row.count);
      if (row.status === OrderStatus.RECEIVED) breakdown.received = Number(row.count);
    }
    return { available: true, pending: breakdown.draft + breakdown.received, breakdown };
  }

  private async productionStage(actor: AuthenticatedUser): Promise<OperationalDashboardSummary['stages']['production']> {
    const breakdown = { draft: 0, issued: 0, inProgress: 0 };
    if (!this.can(actor, 'production.consolidations.read')) return { available: false, pending: 0, breakdown };
    const builder = this.productionRepository.createQueryBuilder('consolidation')
      .select('consolidation.status', 'status')
      .addSelect('COUNT(DISTINCT consolidation.id)::integer', 'count')
      .where('consolidation.status IN (:...statuses)', {
        statuses: [ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS],
      })
      .groupBy('consolidation.status');
    if (actor.productionAreaIds.length) {
      builder.andWhere(`EXISTS (
        SELECT 1 FROM consolidaciones_detalle dashboard_detail
        WHERE dashboard_detail.consolidacion_id = consolidation.id
          AND dashboard_detail.area_produccion_id IN (:...productionAreaIds)
      )`, { productionAreaIds: actor.productionAreaIds });
    }
    const rows = await builder.getRawMany<{ status: ProductionConsolidationStatus; count: number | string }>();
    for (const row of rows) {
      if (row.status === ProductionConsolidationStatus.DRAFT) breakdown.draft = Number(row.count);
      if (row.status === ProductionConsolidationStatus.ISSUED) breakdown.issued = Number(row.count);
      if (row.status === ProductionConsolidationStatus.IN_PROGRESS) breakdown.inProgress = Number(row.count);
    }
    return { available: true, pending: breakdown.draft + breakdown.issued + breakdown.inProgress, breakdown };
  }

  private async preparationStage(actor: AuthenticatedUser): Promise<OperationalDashboardSummary['stages']['preparation']> {
    const breakdown = { notStarted: 0, inProgress: 0, observed: 0 };
    if (!this.can(actor, 'preparations.read')) return { available: false, pending: 0, breakdown };
    const notStarted = this.orderRepository.createQueryBuilder('customer_order')
      .where('customer_order.status = :confirmed', { confirmed: OrderStatus.CONFIRMED })
      .andWhere(`NOT EXISTS (
        SELECT 1 FROM preparaciones_pedido dashboard_preparation
        WHERE dashboard_preparation.pedido_id = customer_order.id
          AND dashboard_preparation.estado <> :cancelled
      )`, { cancelled: PreparationStatus.CANCELED });
    this.applyCustomerScope(notStarted, actor, 'customer_order');
    breakdown.notStarted = await notStarted.getCount();

    const active = this.preparationRepository.createQueryBuilder('preparation')
      .innerJoin('preparation.order', 'customer_order')
      .select('preparation.status', 'status')
      .addSelect('COUNT(preparation.id)::integer', 'count')
      .where('customer_order.status = :confirmed', { confirmed: OrderStatus.CONFIRMED })
      .andWhere('preparation.status IN (:...statuses)', {
        statuses: [PreparationStatus.PENDING, PreparationStatus.IN_PROGRESS, PreparationStatus.OBSERVED],
      })
      .groupBy('preparation.status');
    this.applyCustomerScope(active, actor, 'customer_order');
    const rows = await active.getRawMany<{ status: PreparationStatus; count: number | string }>();
    for (const row of rows) {
      if (row.status === PreparationStatus.PENDING || row.status === PreparationStatus.IN_PROGRESS) breakdown.inProgress += Number(row.count);
      if (row.status === PreparationStatus.OBSERVED) breakdown.observed = Number(row.count);
    }
    return {
      available: true,
      pending: breakdown.notStarted + breakdown.inProgress + breakdown.observed,
      breakdown,
    };
  }

  private async distributionStage(actor: AuthenticatedUser): Promise<OperationalDashboardSummary['stages']['distribution']> {
    const breakdown = { readyForRoute: 0, scheduled: 0, inDelivery: 0 };
    if (!this.can(actor, 'distribution.routes.read') && !this.can(actor, 'distribution.summary.read')) {
      return { available: false, pending: 0, breakdown };
    }
    const ready = this.preparationRepository.createQueryBuilder('preparation')
      .innerJoin('preparation.order', 'customer_order')
      .where('preparation.status = :prepared', { prepared: PreparationStatus.PREPARED })
      .andWhere('preparation.handedOffAt IS NOT NULL')
      .andWhere('NOT EXISTS (SELECT 1 FROM rutas_entregas dashboard_delivery WHERE dashboard_delivery.preparacion_id = preparation.id)');
    this.applyCustomerScope(ready, actor, 'customer_order');
    breakdown.readyForRoute = await ready.getCount();

    const deliveries = this.deliveryRepository.createQueryBuilder('delivery')
      .innerJoin('delivery.route', 'route')
      .innerJoin('delivery.order', 'customer_order')
      .select('route.status', 'status')
      .addSelect('COUNT(delivery.id)::integer', 'count')
      .where('delivery.status = :pending', { pending: RouteDeliveryStatus.PENDING })
      .andWhere('route.status IN (:...statuses)', {
        statuses: [DistributionRouteStatus.DRAFT, DistributionRouteStatus.PLANNED, DistributionRouteStatus.IN_DELIVERY],
      })
      .groupBy('route.status');
    this.applyCustomerScope(deliveries, actor, 'customer_order');
    const rows = await deliveries.getRawMany<{ status: DistributionRouteStatus; count: number | string }>();
    for (const row of rows) {
      if (row.status === DistributionRouteStatus.DRAFT || row.status === DistributionRouteStatus.PLANNED) breakdown.scheduled += Number(row.count);
      if (row.status === DistributionRouteStatus.IN_DELIVERY) breakdown.inDelivery = Number(row.count);
    }
    return {
      available: true,
      pending: breakdown.readyForRoute + breakdown.scheduled + breakdown.inDelivery,
      breakdown,
    };
  }

  private applyCustomerScope<T extends ObjectLiteral>(builder: SelectQueryBuilder<T>, actor: AuthenticatedUser, orderAlias: string): void {
    if (actor.type === UserType.CUSTOMER) {
      builder.andWhere(`${orderAlias}.customerId = :dashboardCustomerId`, { dashboardCustomerId: actor.customerId });
    }
  }

  private can(actor: AuthenticatedUser, permission: string): boolean {
    return actor.permissions.includes(permission);
  }
}
