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
import { ProductionServiceParte03 } from './production.03-adjustPlan';

export abstract class ProductionServiceParte02 extends ProductionServiceParte03 {
  async generate(
      dto: GenerateProductionConsolidationDto,
      actor: AuthenticatedUser,
      complementary: boolean,
    ): Promise<ProductionConsolidation> {
      const consolidationId = await workflowTransaction(this.dataSource, async (manager) => {
        await this.lockDeliveryDate(manager, dto.deliveryDate);
        const consolidationRepository = manager.getRepository(ProductionConsolidation);
        const stockRequestRepository = manager.getRepository(StockReplenishmentRequest);
        let stockRequestId = dto.stockRequestId;
        let sourceDate = dto.deliveryDate;
        if (stockRequestId) {
          const requestedSource = await stockRequestRepository
            .createQueryBuilder('request')
            .setLock('pessimistic_write')
            .where('request.id = :id', { id: stockRequestId })
            .getOne();
          if (!requestedSource) throw new NotFoundException('Solicitud de abastecimiento no encontrada');
          if (requestedSource.status !== StockReplenishmentRequestStatus.SENT) {
            throw new ConflictException('La solicitud de abastecimiento ya no se encuentra pendiente de programación');
          }
          sourceDate = requestedSource.requiredDate;
          if (sourceDate !== dto.deliveryDate) await this.lockDeliveryDate(manager, sourceDate);
        } else {
          const pendingRequests = await stockRequestRepository.find({
            where: { requiredDate: dto.deliveryDate, status: StockReplenishmentRequestStatus.SENT },
            order: { code: 'ASC' },
          });
          if (pendingRequests.length > 1) {
            throw new UnprocessableEntityException('Existen varias solicitudes de abastecimiento para esta fecha; genere cada orden desde Solicitudes pendientes');
          }
          stockRequestId = pendingRequests[0]?.id;
        }
        let generateComplementary = complementary;
        const mainConsolidation = await consolidationRepository.findOne({
          where: { deliveryDate: dto.deliveryDate, type: ProductionConsolidationType.MAIN },
        });
        if (complementary) {
          const prior = await consolidationRepository.findOne({
            where: {
              deliveryDate: dto.deliveryDate,
              status: In([
                ProductionConsolidationStatus.ISSUED,
                ProductionConsolidationStatus.IN_PROGRESS,
                ProductionConsolidationStatus.CLOSED,
              ]),
            },
          });
          if (!prior) {
            throw new ConflictException('Debe existir una versión emitida antes de generar una consolidación complementaria');
          }
          const draft = await consolidationRepository.findOne({
            where: {
              deliveryDate: dto.deliveryDate,
              type: ProductionConsolidationType.COMPLEMENTARY,
              status: ProductionConsolidationStatus.DRAFT,
            },
          });
          if (draft) throw new ConflictException('Ya existe una consolidación complementaria en Borrador para esta fecha');
        } else if (stockRequestId && mainConsolidation) {
          generateComplementary = true;
        } else {
          if (mainConsolidation) throw new ConflictException('La consolidación principal ya existe; utilice recálculo o una complementaria');
        }
  
        const ids = await this.eligibleOrderDetailIds(manager, sourceDate);
        const preparationDeadlineAt = ids.length ? await this.preparationDeadline(manager, ids) : null;
        const versionResult = await consolidationRepository
          .createQueryBuilder('consolidation')
          .select('COALESCE(MAX(consolidation.version), 0)', 'maximum')
          .where('consolidation.deliveryDate = :deliveryDate', { deliveryDate: dto.deliveryDate })
          .getRawOne<{ maximum: string }>();
        const consolidation = await consolidationRepository.save(consolidationRepository.create({
          deliveryDate: dto.deliveryDate,
          preparationDeadlineAt,
          version: Number(versionResult?.maximum ?? 0) + 1,
          type: generateComplementary ? ProductionConsolidationType.COMPLEMENTARY : ProductionConsolidationType.MAIN,
          status: ProductionConsolidationStatus.DRAFT,
          generatedById: actor.id,
          emittedById: null,
          emittedAt: null,
          closedById: null,
          closedAt: null,
        }));
        const orderDetails = ids.length ? await this.loadOrderDetails(manager, ids) : [];
        consolidation.preparationDeadlineAt = orderDetails.length ? this.earliestPreparation(orderDetails) : null;
        await manager.getRepository(ProductionConsolidation).save(consolidation);
        await this.rebuildDraft(manager, consolidation, orderDetails, stockRequestId);
        const plannedDetailCount = await manager.getRepository(ProductionConsolidationDetail).count({
          where: { consolidationId: consolidation.id },
        });
        if (!plannedDetailCount) {
          throw new UnprocessableEntityException('No existen pedidos confirmados ni una solicitud de abastecimiento enviada para esta fecha');
        }
        await this.saveHistory(manager, consolidation.id, null, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.GENERATION, actor.id, orderDetails.length
          ? (generateComplementary ? 'Orden complementaria generada desde pedidos confirmados' : 'Orden de Producción generada desde pedidos confirmados')
          : 'Orden de Producción generada desde una solicitud de abastecimiento para stock');
        await this.saveAudit(manager, actor.id, 'GENERAR_CONSOLIDACION', consolidation.id, {
          deliveryDate: dto.deliveryDate,
          sourceDate,
          version: consolidation.version,
          type: consolidation.type,
          stockRequestId: stockRequestId ?? null,
          sourceCount: ids.length,
        });
        return consolidation.id;
      });
      return this.findOne(consolidationId, actor);
    }

  async recalculate(id: string, actor: AuthenticatedUser): Promise<ProductionConsolidation> {
      await workflowTransaction(this.dataSource, async (manager) => {
        const consolidation = await manager.getRepository(ProductionConsolidation)
          .createQueryBuilder('consolidation')
          .setLock('pessimistic_write')
          .where('consolidation.id = :id', { id })
          .getOne();
        if (!consolidation) throw new NotFoundException('Consolidación no encontrada');
        if (consolidation.status !== ProductionConsolidationStatus.DRAFT) {
          throw new ConflictException('Solo una consolidación en Borrador puede recalcularse');
        }
        await this.lockDeliveryDate(manager, consolidation.deliveryDate);
        const sourceDate = await this.sourceDateFor(manager, consolidation);
        if (sourceDate !== consolidation.deliveryDate) await this.lockDeliveryDate(manager, sourceDate);
        const currentRows = await manager.query<{ id: string }[]>(
          `SELECT source.detalle_pedido_id AS id
             FROM consolidaciones_origen source
             JOIN consolidaciones_detalle detail ON detail.id = source.detalle_consolidado_id
             JOIN pedidos_detalle order_detail ON order_detail.id = source.detalle_pedido_id
             JOIN pedidos orders ON orders.id = order_detail.pedido_id
            WHERE detail.consolidacion_id = $1
              AND orders.estado = 'CONFIRMADO'
              AND orders.fecha_solicitada = $2`,
          [id, sourceDate],
        );
        const newIds = await this.eligibleOrderDetailIds(manager, sourceDate);
        const ids = [...new Set([...currentRows.map((row) => row.id), ...newIds])];
        const orderDetails = ids.length ? await this.loadOrderDetails(manager, ids) : [];
        await this.rebuildDraft(manager, consolidation, orderDetails);
        await this.saveHistory(manager, id, ProductionConsolidationStatus.DRAFT, ProductionConsolidationStatus.DRAFT, ProductionHistoryEvent.RECALCULATION, actor.id, 'Borrador recalculado');
        await this.saveAudit(manager, actor.id, 'RECALCULAR_CONSOLIDACION', id, { sourceCount: ids.length });
      });
      return this.findOne(id, actor);
    }
}
