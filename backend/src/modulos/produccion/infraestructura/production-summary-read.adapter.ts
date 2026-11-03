import type { ProductionSummaryView } from '../aplicacion/modelos/production-summary.view';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ProductionConsolidationQuery } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidationStatus } from '../dominio/production.enums';
import { paginate } from '../../../compartido/dto/pagination-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionQueryFilters } from './production-query-filters';
import { ProductionSummaryPort } from '../aplicacion/puertos/production-summary-read.port';
@Injectable()
export class TypeOrmProductionSummaryAdapter extends ProductionSummaryPort {
  constructor(
    @InjectRepository(ProductionConsolidationDetail)
    private readonly detailRepository: Repository<ProductionConsolidationDetail>,
    private readonly productionQueryFilters: ProductionQueryFilters,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly dataSource: DataSource,
  ) {
    super();
  }
  async summary(query: ProductionConsolidationQuery, actor: ProductionActor) {
    const builder = this.detailRepository
      .createQueryBuilder('detail')
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
    this.productionQueryFilters.applyFilters(builder, query, 'consolidation', 'detail');
    this.productionQueryFilters.applyProductionAreaScope(builder, actor, 'consolidation', 'detail');
    if (this.productionAccessPolicy.isRequirementsOnly(actor)) {
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
      .getRawMany<ProductionSummaryView>();
    return paginate(rows, Number(countRows[0]?.total ?? 0), query.page, query.limit);
  }
}
