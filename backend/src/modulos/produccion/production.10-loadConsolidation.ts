import { workflowTransaction } from '../pedidos/order-workflow';
import { TrackingService } from '../seguimiento-mensajeria/tracking.service';
import { productionTrackingSummary } from './production-tracking';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { RecordStatus } from '../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditEvent } from '../seguridad/auditoria/entidades/audit-event.entity';
import { ProductCategory } from '../productos/catalogo/entidades/product-category.entity';
import { InventoryMovement } from '../almacen/entidades/inventory-movement.entity';
import { InventoryMovementType } from '../almacen/entidades/inventory.enums';
import { Stock } from '../almacen/entidades/stock.entity';
import { StockReplenishmentRequestDetail } from '../almacen/entidades/stock-replenishment-request-detail.entity';
import { StockReplenishmentRequest } from '../almacen/entidades/stock-replenishment-request.entity';
import { StockReplenishmentRequestStatus } from '../almacen/entidades/inventory.enums';
import { OrderDetail } from '../pedidos/entidades/order-detail.entity';
import { OrderStatus } from '../pedidos/entidades/order.enums';
import {
  AdjustProductionPlanDto,
  CloseProductionConsolidationDto,
  CreateProductionAreaDto,
  GenerateProductionConsolidationDto,
  ProductionConsolidationQueryDto,
  RegisterProductionProgressDto,
  RegisterProductionDeliveryDto,
  ReceiveProductionDeliveryDto,
  ScheduleProductionDetailDto,
  ProductionReasonDto,
  UpdateProductionAreaDto,
} from './dto/production.dto';
import { ProductionArea } from './entidades/production-area.entity';
import { ProductionConsolidationDetail } from './entidades/production-consolidation-detail.entity';
import { ProductionConsolidationHistory } from './entidades/production-consolidation-history.entity';
import { ProductionConsolidationSource } from './entidades/production-consolidation-source.entity';
import { ProductionConsolidation } from './entidades/production-consolidation.entity';
import { ProductionProgress } from './entidades/production-progress.entity';
import { ProductionDelivery } from './entidades/production-delivery.entity';
import {
  ProductionConsolidationStatus,
  ProductionConsolidationType,
  ProductionDeliveryStatus,
  ProductionDetailStage,
  ProductionHistoryEvent,
  ProductionProgressType,
} from './entidades/production.enums';
import {
  baseContribution,
  batchAdjustment,
  decimalForScale,
  productionDifference,
  roundForScale,
} from './production-calculations';

interface ResolvedSource {
  orderDetail: OrderDetail;
  originalQuantity: number;
  reservedQuantity: number;
  pendingQuantity: number;
  appliedFactor: number;
  baseContribution: number;
  warehouseContribution: number;
  productionContribution: number;
  decimalScale: number;
}

interface ConsolidatedGroup {
  productId: string;
  categoryId: string;
  productLineId: string;
  presentationId: string;
  baseUnitId: string;
  productionAreaId: string | null;
  decimalScale: number;
  requestedQuantity: number;
  warehouseCoveredQuantity: number;
  productionRequiredQuantity: number;
  stockRequestedQuantity: number;
  stockRequestDetailId: string | null;
  sources: ResolvedSource[];
}
import { ProductionServiceParte11 } from './production.11-rebuildDraft';

export abstract class ProductionServiceParte10 extends ProductionServiceParte11 {
  protected async loadConsolidation(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
      const consolidation = await this.consolidationRepository.findOne({
        where: { id },
        // El seguimiento necesita responsables, no sus roles/permisos anidados.
        // Cargar solo las relaciones explícitas evita multiplicar filas en cada refresco.
        loadEagerRelations: false,
        relations: {
          generatedBy: true,
          emittedBy: true,
          closedBy: true,
          canceledBy: true,
          details: {
            product: true,
            category: true,
            productLine: true,
            baseUnit: true,
            presentation: { unit: true },
            productionArea: true,
            canceledBy: true,
            stockRequestDetail: { request: true },
            sources: { presentation: true, orderDetail: { order: { customer: true } } },
            progress: { user: true },
            deliveries: { deliveredBy: true, receivedBy: true },
          },
        },
      });
      if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
      const areaIds = this.productionAreaScope(actor);
      if (areaIds) {
        consolidation.details = consolidation.details.filter(
          (detail) => detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId),
        );
        if (!consolidation.details.length) {
          throw new ForbiddenException('La orden no contiene productos de las áreas de Producción asignadas al usuario');
        }
      }
      consolidation.details.sort((left, right) =>
        left.scheduledDate.localeCompare(right.scheduledDate)
        || (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '')
        || left.sequence - right.sequence
        || (left.category?.name ?? '').localeCompare(right.category?.name ?? '')
        || left.productLine.name.localeCompare(right.productLine.name)
        || left.product.name.localeCompare(right.product.name)
        || (left.presentation?.description ?? '').localeCompare(right.presentation?.description ?? ''));
      for (const detail of consolidation.details) {
        detail.sources?.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        detail.progress?.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
        detail.deliveries?.sort((left, right) => left.deliveredAt.getTime() - right.deliveredAt.getTime());
      }
      return consolidation;
    }

  protected isRequirementsOnly(actor: AuthenticatedUser): boolean {
      return actor.permissions.includes('production.requirements.read')
        && !actor.permissions.includes('production.consolidations.create')
        && !actor.permissions.includes('production.plan.adjust');
    }

  protected productionAreaScope(actor: AuthenticatedUser): string[] | null {
      if (!actor.roles.includes('PRODUCCION') || actor.roles.includes('ADMINISTRADOR')) return null;
      return actor.productionAreaIds ?? [];
    }

  protected applyProductionAreaScope<T extends ObjectLiteral>(
      builder: SelectQueryBuilder<T>,
      actor: AuthenticatedUser,
      consolidationAlias = 'consolidation',
      detailAlias?: string,
    ): void {
      const areaIds = this.productionAreaScope(actor);
      if (areaIds === null) return;
      if (!areaIds.length) {
        builder.andWhere('1 = 0');
        return;
      }
      if (detailAlias) {
        builder.andWhere(`${detailAlias}.productionAreaId IN (:...actorAreaIds)`, { actorAreaIds: areaIds });
        return;
      }
      builder.andWhere(
        `EXISTS (SELECT 1 FROM consolidaciones_detalle actor_detail WHERE actor_detail.consolidacion_id = ${consolidationAlias}.id AND actor_detail.area_produccion_id IN (:...actorAreaIds))`,
        { actorAreaIds: areaIds },
      );
    }

  protected assertProductionAreaAccess(actor: AuthenticatedUser, productionAreaId: string | null): void {
      const areaIds = this.productionAreaScope(actor);
      if (areaIds === null) return;
      if (!productionAreaId || !areaIds.includes(productionAreaId)) {
        throw new ForbiddenException('El producto no pertenece a un área de Producción asignada al usuario');
      }
    }

  protected assertWholeOrderAccess(actor: AuthenticatedUser, details: ProductionConsolidationDetail[]): void {
      const areaIds = this.productionAreaScope(actor);
      if (areaIds === null) return;
      if (details.some((detail) => !detail.productionAreaId || !areaIds.includes(detail.productionAreaId))) {
        throw new ForbiddenException('Para cancelar o cerrar toda la orden debe tener asignadas todas sus áreas de Producción');
      }
    }

  protected requiredReason(value: string): string {
      const reason = value?.trim();
      if (!reason || reason.length < 5) {
        throw new BadRequestException('Debe registrar una observación de al menos 5 caracteres');
      }
      return reason;
    }

  protected async eligibleOrderDetailIds(
      manager: EntityManager,
      deliveryDate: string,
    ): Promise<string[]> {
      const filters = [
        `orders.estado = 'CONFIRMADO'`,
        'orders.fecha_solicitada = $1',
        'source.id IS NULL',
      ];
      const rows = await manager.query<{ id: string }[]>(
        `SELECT order_detail.id
           FROM pedidos_detalle order_detail
           JOIN pedidos orders ON orders.id = order_detail.pedido_id
           LEFT JOIN consolidaciones_origen source ON source.detalle_pedido_id = order_detail.id
          WHERE ${filters.join(' AND ')}
          ORDER BY order_detail.id
          FOR UPDATE OF order_detail`,
        [deliveryDate],
      );
      return rows.map((row) => row.id);
    }

  protected loadOrderDetails(manager: EntityManager, ids: string[]): Promise<OrderDetail[]> {
      return manager.getRepository(OrderDetail).createQueryBuilder('detail')
        .leftJoinAndSelect('detail.order', 'order')
        .leftJoinAndSelect('order.customer', 'customer')
        .leftJoinAndSelect('detail.presentation', 'presentation')
        .leftJoinAndSelect('presentation.unit', 'presentationUnit')
        .leftJoinAndSelect('presentation.product', 'product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.productLine', 'productLine')
        .leftJoinAndSelect('product.baseUnit', 'baseUnit')
        .where('detail.id IN (:...ids)', { ids })
        .orderBy('detail.id', 'ASC')
        .getMany();
    }

  protected async preparationDeadline(manager: EntityManager, detailIds: string[]): Promise<Date> {
      const rows = await manager.query<Array<{ deadline: Date }>>(
        `SELECT MIN(orders.fecha_preparacion) AS deadline
           FROM pedidos_detalle detail
           JOIN pedidos orders ON orders.id = detail.pedido_id
          WHERE detail.id = ANY($1::uuid[])`,
        [detailIds],
      );
      if (!rows[0]?.deadline) throw new UnprocessableEntityException('Los pedidos no tienen una fecha límite de preparación válida');
      return new Date(rows[0].deadline);
    }

  protected earliestPreparation(details: OrderDetail[]): Date {
      const timestamps = details.map((detail) => new Date(detail.order.preparationAt).getTime()).filter(Number.isFinite);
      if (!timestamps.length) throw new UnprocessableEntityException('Los pedidos no tienen una fecha límite de preparación válida');
      return new Date(Math.min(...timestamps));
    }
}
