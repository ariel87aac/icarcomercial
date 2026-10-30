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
import { ProductionServiceParte05 } from './production.05-registerDelivery';

export abstract class ProductionServiceParte04 extends ProductionServiceParte05 {
  async emit(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
        if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
          throw new ConflictException('Solo un Borrador puede emitirse');
        }
        await this.lockDeliveryDate(manager, consolidation.deliveryDate);
        await this.validateDraftIntegrity(manager, consolidation);
        await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder()
          .update()
          .set({ stage: ProductionDetailStage.COMPLETED })
          .where('consolidacion_id = :id', { id })
          .andWhere('cantidad_planificada = 0')
          .execute();
        consolidation.status = ProductionConsolidationStatus.ISSUED;
        consolidation.emittedById = actor.id;
        consolidation.emittedAt = new Date();
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.saveHistory(manager, id, ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.ISSUED, ProductionHistoryEvent.ISSUE, actor.id, 'Requerimiento emitido a Producción');
        await this.saveAudit(manager, actor.id, 'EMITIR_CONSOLIDACION', id, {
          deliveryDate: consolidation.deliveryDate,
          version: consolidation.version,
          type: consolidation.type,
        });
      });
      return this.findOne(id, actor);
    }

  async sources(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidationSource[]> {
      await this.findOne(id, actor);
      const builder = this.sourceRepository.createQueryBuilder('source')
        .leftJoinAndSelect('source.consolidatedDetail', 'detail')
        .leftJoinAndSelect('detail.product', 'product')
        .leftJoinAndSelect('detail.productLine', 'productLine')
        .leftJoinAndSelect('detail.baseUnit', 'baseUnit')
        .leftJoinAndSelect('source.presentation', 'presentation')
        .leftJoinAndSelect('source.orderDetail', 'orderDetail')
        .leftJoinAndSelect('orderDetail.order', 'order')
        .leftJoinAndSelect('order.customer', 'customer')
        .where('detail.consolidationId = :id', { id })
        .orderBy('productLine.name', 'ASC')
        .addOrderBy('product.name', 'ASC')
        .addOrderBy('order.code', 'ASC');
      const areaIds = this.productionAreaScope(actor);
      if (areaIds) {
        if (areaIds.length) builder.andWhere('detail.productionAreaId IN (:...actorAreaIds)', { actorAreaIds: areaIds });
        else builder.andWhere('1 = 0');
      }
      return builder.getMany();
    }

  async startDetail(id: string, detailId: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const detail = await manager.getRepository(ProductionConsolidationDetail).createQueryBuilder('detail')
          .innerJoinAndSelect('detail.consolidation', 'consolidation')
          .innerJoinAndSelect('detail.product', 'product')
          .setLock('pessimistic_write')
          .where('detail.id = :detailId', { detailId })
          .andWhere('detail.consolidationId = :id', { id })
          .getOne();
        if (!detail) throw new NotFoundException('Producto de la orden no encontrado');
        this.assertProductionAreaAccess(actor, detail.productionAreaId);
        if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(detail.consolidation.status)) {
          throw new ConflictException('El producto solo puede iniciarse en una orden Emitida o En proceso');
        }
        if (![ProductionDetailStage.PENDING, ProductionDetailStage.PARTIALLY_RECEIVED].includes(detail.stage)) {
          throw new ConflictException('El producto no se encuentra disponible para iniciar producción');
        }
        const previousStatus = detail.consolidation.status;
        detail.stage = ProductionDetailStage.IN_PROGRESS;
        detail.startedAt ??= new Date();
        await manager.getRepository(ProductionConsolidationDetail).save(detail);
        if (detail.consolidation.status === ProductionConsolidationStatus.ISSUED) {
          detail.consolidation.status = ProductionConsolidationStatus.IN_PROGRESS;
          await manager.getRepository(ProductionConsolidation).save(detail.consolidation);
          await this.saveHistory(manager, id, previousStatus, ProductionConsolidationStatus.IN_PROGRESS, ProductionHistoryEvent.START, actor.id, `Producción iniciada: ${detail.product.name}`);
        } else {
          await this.saveHistory(manager, id, previousStatus, previousStatus, ProductionHistoryEvent.START, actor.id, `Producción iniciada: ${detail.product.name}`);
        }
        await this.saveAudit(manager, actor.id, 'INICIAR_PRODUCTO_PRODUCCION', id, { consolidatedDetailId: detail.id });
      });
      return this.findOne(id, actor);
    }
}
