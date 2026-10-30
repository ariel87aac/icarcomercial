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
import { ProductionServiceParte04 } from './production.04-emit';

export abstract class ProductionServiceParte03 extends ProductionServiceParte04 {
  async adjustPlan(
      id: string,
      detailId: string,
      dto: AdjustProductionPlanDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
        if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
          throw new ConflictException('El ajuste por batch o capacidad solo puede modificarse mientras la orden está en Borrador');
        }
        const detail = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
          .innerJoinAndSelect('detail.product', 'product')
          .setLock('pessimistic_write')
          .where('detail.id = :detailId', { detailId })
          .andWhere('detail.consolidationId = :id', { id })
          .getOne();
        if (!detail) throw new NotFoundException('Detalle consolidado no encontrado');
        this.assertProductionAreaAccess(actor, detail.productionAreaId);
        const scale = detail.baseUnit.decimalScale;
        const required = roundForScale(
          Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
          scale,
        );
        if (dto.additionalQuantity === undefined && dto.plannedQuantity === undefined) {
          throw new BadRequestException('Debe indicar la cantidad del ajuste por batch o capacidad');
        }
        const planned = roundForScale(
          dto.additionalQuantity !== undefined ? required + dto.additionalQuantity : Number(dto.plannedQuantity),
          scale,
        );
        if (planned < required) {
          throw new UnprocessableEntityException('La cantidad planificada no puede ser menor al faltante de pedidos más la solicitud para stock');
        }
        const adjustment = batchAdjustment(planned, required, scale);
        const previousPlanned = detail.plannedQuantity;
        detail.plannedQuantity = decimalForScale(planned, scale);
        detail.additionalProductionQuantity = decimalForScale(adjustment, scale);
        detail.additionalProductionReason = adjustment > 0 ? dto.reason?.trim() || null : null;
        detail.difference = decimalForScale(
          productionDifference(Number(detail.preparedQuantity), planned, scale),
          scale,
        );
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        const observation = adjustment > 0
          ? `${detail.product.name}: plan actualizado de ${previousPlanned} a ${detail.plannedQuantity}; ajuste por batch/capacidad ${detail.additionalProductionQuantity}${detail.additionalProductionReason ? ` (${detail.additionalProductionReason})` : ''}`
          : `${detail.product.name}: ajuste por batch/capacidad retirado; plan ${detail.plannedQuantity}`;
        await this.saveHistory(
          manager,
          id,
          ProductionConsolidationStatus.DRAFT,
          ProductionConsolidationStatus.DRAFT,
          ProductionHistoryEvent.ADDITIONAL_PRODUCTION,
          actor.id,
          observation,
        );
        await this.saveAudit(manager, actor.id, 'AJUSTAR_PLAN_PRODUCCION', id, {
          consolidatedDetailId: detail.id,
          productId: detail.productId,
          productionRequiredQuantity: detail.productionRequiredQuantity,
          stockRequestedQuantity: detail.stockRequestedQuantity,
          previousPlannedQuantity: previousPlanned,
          plannedQuantity: detail.plannedQuantity,
          additionalProductionQuantity: detail.additionalProductionQuantity,
          reason: detail.additionalProductionReason,
        });
      });
      return this.findOne(id, actor);
    }

  async scheduleDetail(
      id: string,
      detailId: string,
      dto: ScheduleProductionDetailDto,
      actor: AuthenticatedUser,
    ): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Orden de Producción no encontrada');
        if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
          throw new ConflictException('La programación solo puede modificarse mientras la orden está en Borrador');
        }
        const detail = await manager.getRepository(ProductionConsolidationDetail)
          .createQueryBuilder('detail')
          .innerJoinAndSelect('detail.baseUnit', 'baseUnit')
          .innerJoinAndSelect('detail.product', 'product')
          .setLock('pessimistic_write')
          .where('detail.id = :detailId', { detailId })
          .andWhere('detail.consolidationId = :id', { id })
          .getOne();
        if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
        this.assertProductionAreaAccess(actor, detail.productionAreaId);
        const reason = dto.reason?.trim() || null;
        if (dto.additionalQuantity > 0 && (!reason || reason.length < 5)) {
          throw new UnprocessableEntityException('Debe explicar el ajuste por batch o capacidad con al menos 5 caracteres');
        }
        const scale = detail.baseUnit.decimalScale;
        const required = roundForScale(
          Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
          scale,
        );
        const additional = roundForScale(dto.additionalQuantity, scale);
        const planned = roundForScale(required + additional, scale);
        const previous = {
          scheduledDate: detail.scheduledDate,
          sequence: detail.sequence,
          additionalQuantity: detail.additionalProductionQuantity,
          plannedQuantity: detail.plannedQuantity,
        };
        detail.scheduledDate = dto.scheduledDate;
        detail.sequence = dto.sequence;
        detail.additionalProductionQuantity = decimalForScale(additional, scale);
        detail.additionalProductionReason = additional > 0 ? reason : null;
        detail.plannedQuantity = decimalForScale(planned, scale);
        detail.difference = decimalForScale(
          productionDifference(Number(detail.preparedQuantity), planned, scale),
          scale,
        );
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        await this.saveHistory(
          manager,
          id,
          ProductionConsolidationStatus.DRAFT,
          ProductionConsolidationStatus.DRAFT,
          ProductionHistoryEvent.SCHEDULING,
          actor.id,
          `${detail.product.name}: programado para ${dto.scheduledDate}, secuencia ${dto.sequence}, plan ${detail.plannedQuantity}`,
        );
        await this.saveAudit(manager, actor.id, 'PROGRAMAR_PRODUCTO_PRODUCCION', id, {
          consolidatedDetailId: detail.id,
          previous,
          scheduledDate: detail.scheduledDate,
          sequence: detail.sequence,
          additionalProductionQuantity: detail.additionalProductionQuantity,
          plannedQuantity: detail.plannedQuantity,
          reason: detail.additionalProductionReason,
        });
      });
      return this.findOne(id, actor);
    }
}
