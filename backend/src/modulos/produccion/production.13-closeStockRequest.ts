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
import { ProductionServiceBase } from './production.base';

export abstract class ProductionServiceParte13 extends ProductionServiceBase {
  protected async closeStockRequest(manager: EntityManager, consolidationId: string, userId: string): Promise<void> {
      const request = await manager.getRepository(StockReplenishmentRequest).findOne({
        where: {
          productionConsolidationId: consolidationId,
          status: StockReplenishmentRequestStatus.SCHEDULED,
        },
      });
      if (!request) return;
      request.status = StockReplenishmentRequestStatus.CLOSED;
      request.closedAt = new Date();
      request.closedById = userId;
      request.closeObservation = null;
      await manager.getRepository(StockReplenishmentRequest).save(request);
    }

  protected async closeStockRequestIncomplete(
      manager: EntityManager,
      consolidationId: string,
      userId: string,
      reason: string,
    ): Promise<void> {
      const request = await manager.getRepository(StockReplenishmentRequest).findOne({
        where: {
          productionConsolidationId: consolidationId,
          status: StockReplenishmentRequestStatus.SCHEDULED,
        },
      });
      if (!request) return;
      request.status = StockReplenishmentRequestStatus.CLOSED_INCOMPLETE;
      request.closedAt = new Date();
      request.closedById = userId;
      request.closeObservation = reason;
      await manager.getRepository(StockReplenishmentRequest).save(request);
    }

  protected saveHistory(
      manager: EntityManager,
      consolidationId: string,
      previousStatus: ProductionConsolidationStatus | null,
      newStatus: ProductionConsolidationStatus,
      event: ProductionHistoryEvent,
      userId: string,
      observation: string | null,
    ): Promise<ProductionConsolidationHistory> {
      const repository = manager.getRepository(ProductionConsolidationHistory);
      return repository.save(repository.create({ consolidationId, previousStatus, newStatus, event, userId, observation }));
    }

  protected saveAudit(
      manager: EntityManager,
      userId: string,
      action: string,
      entityId: string,
      metadata: Record<string, unknown>,
    ): Promise<AuditEvent> {
      const repository = manager.getRepository(AuditEvent);
      return repository.save(repository.create({
        userId,
        module: 'production',
        action,
        entity: 'consolidaciones_produccion',
        entityId,
        result: 'EXITOSO',
        ipAddress: null,
        metadata,
      }));
    }
}
