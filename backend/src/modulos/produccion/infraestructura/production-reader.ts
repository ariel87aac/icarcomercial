import { ProductionError } from '../dominio/production-error';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { ProductionActor } from '../aplicacion/production-actor';
import { ProductionConsolidationQuery } from '../aplicacion/production-inputs';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { ProductionConsolidationStatus } from '../dominio/production.enums';
import { paginate } from '../../../compartido/dto/pagination-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionQueryFilters } from './production-query-filters';

@Injectable()
export class ProductionReader {
  constructor(
    @InjectRepository(ProductionConsolidation)
    private readonly consolidationRepository: Repository<ProductionConsolidation>,
    private readonly productionAccessPolicy: ProductionAccessPolicy,
    private readonly productionQueryFilters: ProductionQueryFilters,
  ) {}

  async queryConsolidations(
    query: ProductionConsolidationQuery,
    actor: ProductionActor,
    statuses?: ProductionConsolidationStatus[],
  ) {
    const builder = this.consolidationRepository
      .createQueryBuilder('consolidation')
      .leftJoinAndSelect('consolidation.generatedBy', 'generatedBy')
      .leftJoinAndSelect('consolidation.emittedBy', 'emittedBy')
      .leftJoinAndSelect('consolidation.closedBy', 'closedBy')
      .leftJoinAndSelect('consolidation.canceledBy', 'canceledBy')
      .distinct(true)
      .orderBy('consolidation.code', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    if (areaIds) {
      builder.loadRelationCountAndMap('consolidation.detailCount', 'consolidation.details', 'visibleDetail', (count) =>
        areaIds.length
          ? count.andWhere('visibleDetail.productionAreaId IN (:...visibleAreaIds)', { visibleAreaIds: areaIds })
          : count.andWhere('1 = 0'),
      );
    } else {
      builder.loadRelationCountAndMap('consolidation.detailCount', 'consolidation.details');
    }
    if (statuses) builder.andWhere('consolidation.status IN (:...allowedStatuses)', { allowedStatuses: statuses });
    this.productionQueryFilters.applyFilters(builder, query);
    this.productionQueryFilters.applyProductionAreaScope(builder, actor);
    const [data, total] = await builder.getManyAndCount();
    return paginate(data, total, query.page, query.limit);
  }

  async loadConsolidation(id: string, actor: ProductionActor): Promise<ProductionConsolidation> {
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
    if (!consolidation) throw new ProductionError('missing', 'Consolidación no encontrada');
    const areaIds = this.productionAccessPolicy.productionAreaScope(actor);
    if (areaIds) {
      consolidation.details = consolidation.details.filter(
        (detail) => detail.productionAreaId !== null && areaIds.includes(detail.productionAreaId),
      );
      if (!consolidation.details.length) {
        throw new ProductionError(
          'forbidden',
          'La orden no contiene productos de las áreas de Producción asignadas al usuario',
        );
      }
    }
    consolidation.details.sort(
      (left, right) =>
        left.scheduledDate.localeCompare(right.scheduledDate) ||
        (left.productionArea?.name ?? '').localeCompare(right.productionArea?.name ?? '') ||
        left.sequence - right.sequence ||
        (left.category?.name ?? '').localeCompare(right.category?.name ?? '') ||
        left.productLine.name.localeCompare(right.productLine.name) ||
        left.product.name.localeCompare(right.product.name) ||
        (left.presentation?.description ?? '').localeCompare(right.presentation?.description ?? ''),
    );
    for (const detail of consolidation.details) {
      detail.sources?.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
      detail.progress?.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
      detail.deliveries?.sort((left, right) => left.deliveredAt.getTime() - right.deliveredAt.getTime());
    }
    return consolidation;
  }
}
