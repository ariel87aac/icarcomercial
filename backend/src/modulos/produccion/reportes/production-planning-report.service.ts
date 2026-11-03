import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { createIcarPdfReport } from '../../../compartido/reportes/icar-pdf-report';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { ProductionAccessPolicy } from '../aplicacion/production-access.policy';
import { ProductionConsolidation } from '../entidades/production-consolidation.entity';
import { buildProductionPlanningReport, ProductionPlanningRawRow } from './production-planning-report';
import { ProductionPlanningReportQueryDto } from './production-report.dto';

@Injectable()
export class ProductionPlanningReportService {
  constructor(
    @InjectRepository(ProductionConsolidation)
    private readonly consolidations: Repository<ProductionConsolidation>,
    private readonly accessPolicy: ProductionAccessPolicy,
    private readonly audit: AuditService,
  ) {}

  async export(query: ProductionPlanningReportQueryDto, actor: AuthenticatedUser) {
    const rows = await this.queryRows(query, actor);
    if (!rows.length) throw new NotFoundException('Orden de Producción no encontrada o sin productos autorizados');
    const generatedAt = new Date();
    const options = buildProductionPlanningReport({
      rows,
      mode: query.mode,
      generatedBy: actor.name,
      generatedAt,
      logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    });
    const content = await createIcarPdfReport(options);
    await this.audit.record({
      userId: actor.id,
      module: 'production',
      action: 'EXPORTAR_PLANIFICACION_PRODUCCION_PDF',
      entity: 'planificacion_produccion',
      entityId: query.orderId,
      result: 'EXITOSO',
      metadata: { mode: query.mode, orderId: query.orderId, orderCode: rows[0].orderCode },
    });
    const suffix = query.mode === 'TOTAL' ? 'total-productos' : 'ordenes-por-area';
    return {
      filename: `icar-planificacion-op-${rows[0].orderCode}-${suffix}-${localDate(generatedAt)}.pdf`,
      mime: 'application/pdf',
      content,
    };
  }

  private async queryRows(
    query: ProductionPlanningReportQueryDto,
    actor: AuthenticatedUser,
  ): Promise<ProductionPlanningRawRow[]> {
    const builder = this.consolidations
      .createQueryBuilder('consolidation')
      .innerJoin('consolidation.details', 'detail')
      .innerJoin('detail.product', 'product')
      .leftJoin('detail.presentation', 'presentation')
      .leftJoin('detail.category', 'category')
      .leftJoin('detail.productionArea', 'area')
      .innerJoin('detail.baseUnit', 'unit')
      .select('consolidation.id', 'orderId')
      .addSelect('consolidation.code', 'orderCode')
      .addSelect('consolidation.status', 'orderStatus')
      .addSelect('consolidation.deliveryDate', 'deliveryDate')
      .addSelect('detail.scheduledDate', 'scheduledDate')
      .addSelect('detail.sequence', 'sequence')
      .addSelect('product.id', 'productId')
      .addSelect('presentation.id', 'presentationId')
      .addSelect('unit.id', 'baseUnitId')
      .addSelect('product.code', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('presentation.description', 'presentationDescription')
      .addSelect('category.name', 'categoryName')
      .addSelect('area.id', 'areaId')
      .addSelect('area.name', 'areaName')
      .addSelect('unit.abbreviation', 'unitAbbreviation')
      .addSelect('detail.plannedQuantity', 'plannedQuantity')
      .where('consolidation.id = :orderId', { orderId: query.orderId })
      .orderBy('area.name', 'ASC', 'NULLS LAST')
      .addOrderBy('detail.scheduledDate', 'ASC')
      .addOrderBy('detail.sequence', 'ASC')
      .addOrderBy('consolidation.code', 'DESC');
    const areaIds = this.accessPolicy.productionAreaScope(actor);
    if (areaIds?.length) builder.andWhere('detail.productionAreaId IN (:...areaIds)', { areaIds });
    else if (areaIds) builder.andWhere('1 = 0');
    return builder.getRawMany<ProductionPlanningRawRow>();
  }
}

function localDate(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(value);
}
