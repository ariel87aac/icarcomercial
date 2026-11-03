import { Injectable } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ProductionConsolidationQuery } from '../aplicacion/production-inputs';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';

@Injectable()
export class ProductionQueryFilters {
  constructor(private readonly productionAccessPolicy: ProductionAccessPolicy) {}

  applyFilters<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    query: ProductionConsolidationQuery,
    consolidationAlias = 'consolidation',
    detailAlias?: string,
  ): void {
    if (query.code) builder.andWhere(`${consolidationAlias}.code = :code`, { code: query.code });
    if (query.deliveryDate)
      builder.andWhere(`${consolidationAlias}.deliveryDate = :deliveryDate`, { deliveryDate: query.deliveryDate });
    if (query.version) builder.andWhere(`${consolidationAlias}.version = :version`, { version: query.version });
    if (query.type) builder.andWhere(`${consolidationAlias}.type = :type`, { type: query.type });
    if (query.status) builder.andWhere(`${consolidationAlias}.status = :status`, { status: query.status });
    else if (query.statuses?.length)
      builder.andWhere(`${consolidationAlias}.status IN (:...filterStatuses)`, { filterStatuses: query.statuses });
    if (detailAlias) {
      if (query.productionAreaId)
        builder.andWhere(`${detailAlias}.productionAreaId = :productionAreaId`, {
          productionAreaId: query.productionAreaId,
        });
      if (query.categoryId)
        builder.andWhere(`${detailAlias}.categoryId = :categoryId`, { categoryId: query.categoryId });
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

  applyProductionAreaScope<T extends ObjectLiteral>(
    builder: SelectQueryBuilder<T>,
    actor: ProductionActor,
    consolidationAlias = 'consolidation',
    detailAlias?: string,
  ): void {
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
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
}
