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
import { ProductionServiceParte10 } from './production.10-loadConsolidation';

export abstract class ProductionServiceParte09 extends ProductionServiceParte10 {
  async summary(query: ProductionConsolidationQueryDto, actor: AuthenticatedUser) {
      const builder = this.detailRepository.createQueryBuilder('detail')
        .innerJoin('detail.consolidation', 'consolidation')
        .innerJoin('detail.productLine', 'productLine')
        .innerJoin('detail.product', 'product')
        .innerJoin('detail.baseUnit', 'baseUnit')
        .leftJoin('detail.presentation', 'presentation')
        .leftJoin('detail.category', 'category')
        .leftJoin('detail.productionArea', 'productionArea')
        .select('consolidation.deliveryDate', 'deliveryDate')
        .addSelect('consolidation.version', 'version')
        .addSelect('consolidation.type', 'type')
        .addSelect('consolidation.status', 'status')
        .addSelect('productLine.id', 'productLineId')
        .addSelect('productLine.name', 'productLineName')
        .addSelect('product.id', 'productId')
        .addSelect('product.name', 'productName')
        .addSelect('category.name', 'categoryName')
        .addSelect('productionArea.name', 'productionAreaName')
        .addSelect('presentation.id', 'presentationId')
        .addSelect('presentation.description', 'presentationDescription')
        .addSelect('baseUnit.id', 'baseUnitId')
        .addSelect('baseUnit.abbreviation', 'baseUnitAbbreviation')
        .addSelect('SUM(detail.requestedQuantity)', 'requestedQuantity')
        .addSelect('SUM(detail.warehouseCoveredQuantity)', 'warehouseCoveredQuantity')
        .addSelect('SUM(detail.productionRequiredQuantity)', 'productionRequiredQuantity')
        .addSelect('SUM(detail.stockRequestedQuantity)', 'stockRequestedQuantity')
        .addSelect('SUM(detail.additionalProductionQuantity)', 'additionalProductionQuantity')
        .addSelect('SUM(detail.plannedQuantity)', 'plannedQuantity')
        .addSelect('SUM(detail.preparedQuantity)', 'preparedQuantity')
        .addSelect('SUM(detail.receivedQuantity)', 'receivedQuantity')
        .addSelect('GREATEST(SUM(detail.plannedQuantity) - SUM(detail.preparedQuantity), 0)', 'pendingQuantity')
        .addSelect('SUM(detail.difference)', 'difference')
        .groupBy('consolidation.deliveryDate')
        .addGroupBy('consolidation.version')
        .addGroupBy('consolidation.type')
        .addGroupBy('consolidation.status')
        .addGroupBy('productLine.id')
        .addGroupBy('productLine.name')
        .addGroupBy('product.id')
        .addGroupBy('product.name')
        .addGroupBy('category.name')
        .addGroupBy('productionArea.name')
        .addGroupBy('presentation.id')
        .addGroupBy('presentation.description')
        .addGroupBy('baseUnit.id')
        .addGroupBy('baseUnit.abbreviation')
        .orderBy('consolidation.deliveryDate', 'DESC')
        .addOrderBy('productLine.name', 'ASC')
        .addOrderBy('product.name', 'ASC');
      this.applyFilters(builder, query, 'consolidation', 'detail');
      this.applyProductionAreaScope(builder, actor, 'consolidation', 'detail');
      if (this.isRequirementsOnly(actor)) {
        builder.andWhere('consolidation.status <> :draftStatus', { draftStatus: ProductionConsolidationStatus.DRAFT });
      }
      const countBuilder = builder.clone();
      countBuilder.expressionMap.orderBys = {};
      const [countSql, countParameters] = countBuilder.getQueryAndParameters();
      const countRows = await this.dataSource.query<{ total: string }[]>(
        `SELECT COUNT(*)::text AS total FROM (${countSql}) summary_rows`,
        countParameters,
      );
      const rows = await builder
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany();
      return paginate(rows, Number(countRows[0]?.total ?? 0), query.page, query.limit);
    }

  protected async queryConsolidations(
      query: ProductionConsolidationQueryDto,
      actor: AuthenticatedUser,
      statuses?: ProductionConsolidationStatus[],
    ) {
      const builder = this.consolidationRepository.createQueryBuilder('consolidation')
        .leftJoinAndSelect('consolidation.generatedBy', 'generatedBy')
        .leftJoinAndSelect('consolidation.emittedBy', 'emittedBy')
        .leftJoinAndSelect('consolidation.closedBy', 'closedBy')
        .leftJoinAndSelect('consolidation.canceledBy', 'canceledBy')
        .distinct(true)
        .orderBy('consolidation.code', 'DESC')
        .skip((query.page - 1) * query.limit)
        .take(query.limit);
      const areaIds = this.productionAreaScope(actor);
      if (areaIds) {
        builder.loadRelationCountAndMap(
          'consolidation.detailCount',
          'consolidation.details',
          'visibleDetail',
          (count) => areaIds.length
            ? count.andWhere('visibleDetail.productionAreaId IN (:...visibleAreaIds)', { visibleAreaIds: areaIds })
            : count.andWhere('1 = 0'),
        );
      } else {
        builder.loadRelationCountAndMap('consolidation.detailCount', 'consolidation.details');
      }
      if (statuses) builder.andWhere('consolidation.status IN (:...allowedStatuses)', { allowedStatuses: statuses });
      this.applyFilters(builder, query);
      this.applyProductionAreaScope(builder, actor);
      const [data, total] = await builder.getManyAndCount();
      return paginate(data, total, query.page, query.limit);
    }

  protected applyFilters<T extends ObjectLiteral>(
      builder: SelectQueryBuilder<T>,
      query: ProductionConsolidationQueryDto,
      consolidationAlias = 'consolidation',
      detailAlias?: string,
    ): void {
      if (query.code) builder.andWhere(`${consolidationAlias}.code = :code`, { code: query.code });
      if (query.deliveryDate) builder.andWhere(`${consolidationAlias}.deliveryDate = :deliveryDate`, { deliveryDate: query.deliveryDate });
      if (query.version) builder.andWhere(`${consolidationAlias}.version = :version`, { version: query.version });
      if (query.type) builder.andWhere(`${consolidationAlias}.type = :type`, { type: query.type });
      if (query.status) builder.andWhere(`${consolidationAlias}.status = :status`, { status: query.status });
      else if (query.statuses?.length) builder.andWhere(`${consolidationAlias}.status IN (:...filterStatuses)`, { filterStatuses: query.statuses });
      if (detailAlias) {
        if (query.productionAreaId) builder.andWhere(`${detailAlias}.productionAreaId = :productionAreaId`, { productionAreaId: query.productionAreaId });
        if (query.categoryId) builder.andWhere(`${detailAlias}.categoryId = :categoryId`, { categoryId: query.categoryId });
        if (query.productId) builder.andWhere(`${detailAlias}.productId = :productId`, { productId: query.productId });
      } else if (query.productionAreaId || query.categoryId || query.productId) {
        const clauses = [`scope_detail.consolidacion_id = ${consolidationAlias}.id`];
        if (query.productionAreaId) clauses.push('scope_detail.area_produccion_id = :productionAreaId');
        if (query.categoryId) clauses.push('scope_detail.categoria_id = :categoryId');
        if (query.productId) clauses.push('scope_detail.producto_id = :productId');
        builder.andWhere(`EXISTS (SELECT 1 FROM consolidaciones_detalle scope_detail WHERE ${clauses.join(' AND ')})`, {
          ...(query.productionAreaId ? { productionAreaId: query.productionAreaId } : {}),
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.productId ? { productId: query.productId } : {}),
        });
      }
    }
}
