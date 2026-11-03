import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { join } from 'node:path';
import { createIcarPdfReport } from '../../../compartido/reportes/icar-pdf-report';
import { IcarReportColumn, IcarReportOptions } from '../../../compartido/reportes/icar-report.types';
import { createIcarXlsxReport } from '../../../compartido/reportes/icar-xlsx-report';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { ProductionArea } from '../entidades/production-area.entity';
import { ProductionDelivery } from '../entidades/production-delivery.entity';
import { ProductionDailyReportQueryDto, ProductionReportFormat } from './production-report.dto';

interface DailyProductionRawRow {
  areaId: string | null;
  areaName: string | null;
  categoryName: string | null;
  productCode: string;
  productName: string;
  presentationDescription: string | null;
  unitAbbreviation: string;
  producedQuantity: string;
  deliveryCount: number;
  firstDeliveredAt: Date;
  lastDeliveredAt: Date;
}

export interface DailyProductionReport {
  date: string;
  areaIds: string[];
  areaNames: string[];
  generatedAt: string;
  generatedBy: string;
  metrics: {
    areaCount: number;
    productCount: number;
    deliveryCount: number;
    quantityByUnit: Array<{ unit: string; quantity: number }>;
  };
  groups: Array<{ areaId: string | null; areaName: string; rows: DailyProductionRawRow[] }>;
}

@Injectable()
export class ProductionReportService {
  constructor(
    @InjectRepository(ProductionDelivery) private readonly deliveries: Repository<ProductionDelivery>,
    @InjectRepository(ProductionArea) private readonly productionAreas: Repository<ProductionArea>,
    private readonly audit: AuditService,
  ) {}

  async areas(actor: AuthenticatedUser): Promise<Array<Pick<ProductionArea, 'id' | 'name'>>> {
    const scope = this.actorAreaScope(actor);
    if (scope?.length === 0) return [];
    return this.productionAreas.find({
      select: { id: true, name: true },
      where: { status: RecordStatus.ACTIVE, ...(scope ? { id: In(scope) } : {}) },
      order: { name: 'ASC' },
    });
  }

  async daily(query: ProductionDailyReportQueryDto, actor: AuthenticatedUser): Promise<DailyProductionReport> {
    const areaIds = this.resolveAreaIds(query.productionAreaIds, actor);
    const builder = this.deliveries
      .createQueryBuilder('delivery')
      .innerJoin('delivery.consolidatedDetail', 'detail')
      .innerJoin('detail.product', 'product')
      .leftJoin('detail.presentation', 'presentation')
      .leftJoin('detail.category', 'category')
      .leftJoin('detail.productionArea', 'area')
      .innerJoin('detail.baseUnit', 'unit')
      .select('area.id', 'areaId')
      .addSelect('area.name', 'areaName')
      .addSelect('category.name', 'categoryName')
      .addSelect('product.code', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('presentation.description', 'presentationDescription')
      .addSelect('unit.abbreviation', 'unitAbbreviation')
      .addSelect('SUM(delivery.deliveredQuantity)', 'producedQuantity')
      .addSelect('CAST(COUNT(delivery.id) AS integer)', 'deliveryCount')
      .addSelect('MIN(delivery.deliveredAt)', 'firstDeliveredAt')
      .addSelect('MAX(delivery.deliveredAt)', 'lastDeliveredAt')
      .where("CAST(delivery.deliveredAt AT TIME ZONE 'America/La_Paz' AS date) = :date", { date: query.date })
      .groupBy('area.id')
      .addGroupBy('area.name')
      .addGroupBy('category.name')
      .addGroupBy('product.code')
      .addGroupBy('product.name')
      .addGroupBy('presentation.description')
      .addGroupBy('unit.abbreviation')
      .orderBy('area.name', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .addOrderBy('product.code', 'ASC');
    if (areaIds?.length) builder.andWhere('detail.productionAreaId IN (:...areaIds)', { areaIds });
    else if (areaIds) builder.andWhere('1 = 0');
    const rows = await builder.getRawMany<DailyProductionRawRow>();
    const groups = [
      ...rows
        .reduce((map, row) => {
          const key = row.areaId ?? 'none';
          const group = map.get(key) ?? {
            areaId: row.areaId,
            areaName: row.areaName ?? 'Sin área asignada',
            rows: [] as DailyProductionRawRow[],
          };
          group.rows.push(row);
          map.set(key, group);
          return map;
        }, new Map<string, { areaId: string | null; areaName: string; rows: DailyProductionRawRow[] }>())
        .values(),
    ];
    const quantityByUnit = [
      ...rows.reduce(
        (totals, row) =>
          totals.set(row.unitAbbreviation, (totals.get(row.unitAbbreviation) ?? 0) + Number(row.producedQuantity)),
        new Map<string, number>(),
      ),
    ].map(([unit, quantity]) => ({ unit, quantity }));
    return {
      date: query.date,
      areaIds: areaIds ?? [],
      areaNames: groups.map((group) => group.areaName),
      generatedAt: new Date().toISOString(),
      generatedBy: actor.name,
      metrics: {
        areaCount: groups.length,
        productCount: rows.length,
        deliveryCount: rows.reduce((sum, row) => sum + Number(row.deliveryCount), 0),
        quantityByUnit,
      },
      groups,
    };
  }

  async export(query: ProductionDailyReportQueryDto, format: ProductionReportFormat, actor: AuthenticatedUser) {
    const report = await this.daily(query, actor);
    const options = this.reportOptions(report);
    const content =
      format === ProductionReportFormat.PDF ? await createIcarPdfReport(options) : await createIcarXlsxReport(options);
    await this.audit.record({
      userId: actor.id,
      module: 'production',
      action: 'EXPORTAR_REPORTE_PRODUCCION',
      entity: 'reporte_diario_produccion',
      entityId: query.date,
      result: 'EXITOSO',
      metadata: { format, date: query.date, productionAreaIds: query.productionAreaIds ?? [] },
    });
    return {
      filename: `icar-produccion-diaria-${query.date}.${format === ProductionReportFormat.PDF ? 'pdf' : 'xlsx'}`,
      mime:
        format === ProductionReportFormat.PDF
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content,
    };
  }

  private reportOptions(report: DailyProductionReport): IcarReportOptions {
    const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 6 });
    const time = (value: Date) =>
      new Intl.DateTimeFormat('es-BO', {
        timeZone: 'America/La_Paz',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value));
    const columns: IcarReportColumn[] = [
      { key: 'code', label: 'Código', width: 48, excelWidth: 11, align: 'center' },
      { key: 'product', label: 'Producto', width: 172, excelWidth: 28 },
      { key: 'presentation', label: 'Presentación', width: 145, excelWidth: 24 },
      { key: 'category', label: 'Categoría', width: 100, excelWidth: 18 },
      { key: 'quantity', label: 'Producido', width: 70, excelWidth: 14, align: 'right' },
      { key: 'unit', label: 'Unidad', width: 55, excelWidth: 11, align: 'center' },
      { key: 'deliveries', label: 'Entregas', width: 55, excelWidth: 11, align: 'center' },
      { key: 'schedule', label: 'Horario', width: 83, excelWidth: 18, align: 'center' },
    ];
    const dateLabel = new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(
      new Date(`${report.date}T12:00:00`),
    );
    return {
      title: 'Reporte diario de producción',
      code: 'PROD-DIARIO',
      periodLabel: dateLabel,
      filterLabel: report.areaNames.length ? report.areaNames.join(', ') : 'Todas las áreas',
      generatedBy: report.generatedBy,
      generatedAt: new Date(report.generatedAt),
      logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
      columns,
      metrics: [
        { label: 'Áreas con producción', value: report.metrics.areaCount },
        { label: 'Productos elaborados', value: report.metrics.productCount },
        { label: 'Entregas registradas', value: report.metrics.deliveryCount },
      ],
      groups: report.groups.map((group) => ({
        title: group.areaName,
        rows: group.rows.map((row) => ({
          values: {
            code: row.productCode,
            product: row.productName,
            presentation: row.presentationDescription ?? 'Sin presentación',
            category: row.categoryName ?? 'Sin categoría',
            quantity: formatReportQuantity(row.producedQuantity, number),
            unit: row.unitAbbreviation,
            deliveries: Number(row.deliveryCount),
            schedule: `${time(row.firstDeliveredAt)} - ${time(row.lastDeliveredAt)}`,
          },
        })),
      })),
    };
  }

  private resolveAreaIds(requested: string[] | undefined, actor: AuthenticatedUser): string[] | null {
    const scope = this.actorAreaScope(actor);
    if (scope && requested?.some((id) => !scope.includes(id)))
      throw new ForbiddenException('No tiene acceso a una de las áreas seleccionadas');
    return requested?.length ? requested : scope;
  }

  private actorAreaScope(actor: AuthenticatedUser): string[] | null {
    return actor.roles.includes('PRODUCCION') && !actor.roles.includes('ADMINISTRADOR')
      ? (actor.productionAreaIds ?? [])
      : null;
  }
}

function formatReportQuantity(value: string, formatter: Intl.NumberFormat): number | string {
  const quantity = Number(value);
  return Number.isFinite(quantity) ? quantity : formatter.format(0);
}
