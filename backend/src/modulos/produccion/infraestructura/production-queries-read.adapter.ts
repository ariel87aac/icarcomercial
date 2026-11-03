import { ProductionError } from '../dominio/production-error';
import { productionTrackingSummary } from '../dominio/production-tracking';
import { Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ProductionConsolidationQuery } from '../aplicacion/production-inputs';
import { ProductionConsolidationDetail } from '../entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { ProductionConsolidationStatus } from '../dominio/production.enums';
import { ProductionConsolidationSource } from '../entidades/production-consolidation-source.entity';
import { ProductionConsolidationHistory } from '../entidades/production-consolidation-history.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionQueryFilters } from './production-query-filters';
import { ProductionReader } from './production-reader';
import { ProductionQueriesPort } from '../aplicacion/puertos/production-queries-read.port';
@Injectable()
export class TypeOrmProductionQueriesAdapter extends ProductionQueriesPort {
  constructor(
    private readonly productionReader: ProductionReader,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    @InjectRepository(ProductionConsolidationDetail)
    private readonly detailRepository: Repository<ProductionConsolidationDetail>,
    @InjectRepository(ProductionConsolidation)
    private readonly consolidationRepository: Repository<ProductionConsolidation>,
    private readonly productionQueryFilters: ProductionQueryFilters,
    @InjectRepository(ProductionConsolidationSource)
    private readonly sourceRepository: Repository<ProductionConsolidationSource>,
    @InjectRepository(ProductionConsolidationHistory)
    private readonly historyRepository: Repository<ProductionConsolidationHistory>,
  ) {
    super();
  }
  async findAll(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.productionReader.queryConsolidations(
      query,
      actor,
      this.productionAccessPolicy.isRequirementsOnly(actor)
        ? [
            ProductionConsolidationStatus.ISSUED,
            ProductionConsolidationStatus.IN_PROGRESS,
            ProductionConsolidationStatus.CLOSED,
            ProductionConsolidationStatus.CANCELLED,
            ProductionConsolidationStatus.CLOSED_INCOMPLETE,
          ]
        : undefined,
    );
  }
  async requirements(query: ProductionConsolidationQuery, actor: ProductionActor) {
    return this.productionReader.queryConsolidations(query, actor, [
      ProductionConsolidationStatus.ISSUED,
      ProductionConsolidationStatus.IN_PROGRESS,
      ProductionConsolidationStatus.CLOSED,
      ProductionConsolidationStatus.CANCELLED,
      ProductionConsolidationStatus.CLOSED_INCOMPLETE,
    ]);
  }
  async tracking(query: ProductionConsolidationQuery, actor: ProductionActor) {
    const page = await this.findAll(query, actor);
    if (!page.data.length) return page;
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    const details = await this.detailRepository.find({
      loadEagerRelations: false,
      where: {
        consolidationId: In(page.data.map((order) => order.id)),
        ...(areaIds !== null ? { productionAreaId: In(areaIds) } : {}),
      },
      relations: { deliveries: true },
    });
    const grouped = new Map<string, ProductionConsolidationDetail[]>();
    for (const detail of details) {
      const group = grouped.get(detail.consolidationId) ?? [];
      group.push(detail);
      grouped.set(detail.consolidationId, group);
    }
    return {
      ...page,
      data: page.data.map((order) => ({
        ...order,
        tracking: productionTrackingSummary(grouped.get(order.id) ?? []),
      })),
    };
  }
  async findOne(id: string, actor: ProductionActor): Promise<ProductionConsolidation> {
    const consolidation = await this.productionReader.loadConsolidation(id, actor);
    if (
      this.productionAccessPolicy.isRequirementsOnly(actor) &&
      consolidation.status === ProductionConsolidationStatus.DRAFT
    ) {
      throw new ProductionError('forbidden', 'El Borrador todavía no fue emitido a Producción');
    }
    return consolidation;
  }
  async plantBoard(productionAreaId: string | undefined, actor: ProductionActor): Promise<ProductionConsolidation[]> {
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    if (productionAreaId && areaIds !== null && !areaIds.includes(productionAreaId)) {
      throw new ProductionError('forbidden', 'El área de Producción no está asignada al usuario');
    }
    const builder = this.consolidationRepository
      .createQueryBuilder('consolidation')
      .where('consolidation.status IN (:...plantStatuses)', {
        plantStatuses: [ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS],
      })
      .orderBy('consolidation.code', 'DESC');
    if (productionAreaId) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM consolidaciones_detalle plant_detail WHERE plant_detail.consolidacion_id = consolidation.id AND plant_detail.area_produccion_id = :productionAreaId)',
        { productionAreaId },
      );
    }
    this.productionQueryFilters.applyProductionAreaScope(builder, actor);
    const rows = await builder.getMany();
    const orders = await Promise.all(rows.map((row) => this.productionReader.loadConsolidation(row.id, actor)));
    if (!productionAreaId) return orders;
    for (const order of orders) {
      order.details = order.details.filter((detail) => detail.productionAreaId === productionAreaId);
    }
    return orders.filter((order) => order.details.length > 0);
  }
  async sources(id: string, actor: ProductionActor): Promise<ProductionConsolidationSource[]> {
    await this.findOne(id, actor);
    const builder = this.sourceRepository
      .createQueryBuilder('source')
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
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    if (areaIds) {
      if (areaIds.length) builder.andWhere('detail.productionAreaId IN (:...actorAreaIds)', { actorAreaIds: areaIds });
      else builder.andWhere('1 = 0');
    }
    return builder.getMany();
  }
  async history(id: string, actor: ProductionActor): Promise<ProductionConsolidationHistory[]> {
    await this.findOne(id, actor);
    return this.historyRepository
      .createQueryBuilder('history')
      .leftJoinAndSelect('history.user', 'user')
      .where('history.consolidationId = :id', { id })
      .orderBy('history.occurredAt', 'ASC')
      .addOrderBy(
        `CASE "history"."evento"
          WHEN 'GENERACION' THEN 1
          WHEN 'RECALCULO' THEN 2
          WHEN 'AJUSTE_LOTE' THEN 3
          WHEN 'PRODUCCION_ADICIONAL' THEN 3
          WHEN 'PRODUCTO_AGREGADO' THEN 3
          WHEN 'PRODUCTO_RETIRADO' THEN 3
          WHEN 'PROGRAMACION' THEN 3
          WHEN 'EMISION' THEN 4
          WHEN 'INICIO' THEN 5
          WHEN 'AVANCE' THEN 6
          WHEN 'ENTREGA_PRODUCCION' THEN 7
          WHEN 'RECEPCION_ALMACEN' THEN 8
          WHEN 'CANCELACION_PRODUCTO' THEN 8
          WHEN 'CANCELACION_ORDEN' THEN 9
          WHEN 'CIERRE_INCOMPLETO' THEN 9
          WHEN 'CIERRE' THEN 9
          ELSE 99 END`,
        'ASC',
      )
      .addOrderBy('history.id', 'ASC')
      .getMany();
  }
}
