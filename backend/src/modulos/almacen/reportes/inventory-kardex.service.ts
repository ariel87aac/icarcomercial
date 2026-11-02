import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'node:path';
import { Repository } from 'typeorm';
import { createIcarPdfReport } from '../../../compartido/reportes/icar-pdf-report';
import { IcarReportColumn, IcarReportOptions } from '../../../compartido/reportes/icar-report.types';
import { createIcarXlsxReport } from '../../../compartido/reportes/icar-xlsx-report';
import { AuthenticatedUser } from '../../../compartido/interfaces/authenticated-user.interface';
import { DistributionRoute } from '../../distribucion/entidades/distribution-route.entity';
import { RouteDelivery } from '../../distribucion/entidades/route-delivery.entity';
import { Order } from '../../pedidos/entidades/order.entity';
import { ProductPresentation } from '../../productos/catalogo/entidades/product-presentation.entity';
import { ProductionConsolidationDetail } from '../../produccion/entidades/production-consolidation-detail.entity';
import { ProductionConsolidation } from '../../produccion/entidades/production-consolidation.entity';
import { ProductionDelivery } from '../../produccion/entidades/production-delivery.entity';
import { AuditService } from '../../seguridad/auditoria/audit.service';
import { InventoryMovement } from '../entidades/inventory-movement.entity';
import { InventoryMovementType } from '../entidades/inventory.enums';
import { Stock } from '../entidades/stock.entity';
import { movementAmounts, summarizeKardex } from './inventory-kardex.calculations';
import { InventoryKardexFormat, InventoryKardexQueryDto } from './inventory-kardex.dto';

const MOVEMENT_LABELS: Record<InventoryMovementType, string> = {
  INGRESO: 'Ingreso',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  SALIDA_DESPACHO: 'Salida por despacho',
  ENTRADA_DEVOLUCION: 'Ingreso por devolución',
  INGRESO_PRODUCCION: 'Ingreso de Producción',
};

interface MovementReferenceRaw {
  orderCode?: string;
  productionCode?: number;
  routeCode?: string;
}

@Injectable()
export class InventoryKardexService {
  constructor(
    @InjectRepository(InventoryMovement) private readonly movements: Repository<InventoryMovement>,
    @InjectRepository(ProductPresentation) private readonly presentations: Repository<ProductPresentation>,
    private readonly audit: AuditService,
  ) {}

  async options() {
    const rows = await this.presentations.createQueryBuilder('presentation')
      .innerJoin(Stock, 'stock', 'stock.presentationId = presentation.id')
      .innerJoin('presentation.product', 'product')
      .innerJoin('presentation.unit', 'unit')
      .select('presentation.id', 'id')
      .addSelect('product.code', 'productCode')
      .addSelect('product.name', 'productName')
      .addSelect('presentation.description', 'presentationDescription')
      .addSelect('unit.abbreviation', 'unitAbbreviation')
      .distinct(true)
      .orderBy('product.code', 'ASC')
      .addOrderBy('presentation.description', 'ASC')
      .getRawMany<{ id: string; productCode: string; productName: string; presentationDescription: string; unitAbbreviation: string }>();
    return rows.map((row) => ({ ...row, label: `${row.productCode} · ${row.productName} · ${row.presentationDescription}` }));
  }

  async report(query: InventoryKardexQueryDto, actor: AuthenticatedUser) {
    this.validateRange(query);
    const presentation = await this.presentations.findOne({
      where: { id: query.presentationId },
      relations: { product: { category: true, productLine: true }, unit: true },
    });
    if (!presentation) throw new NotFoundException('Presentación de producto no encontrada');
    const builder = this.movements.createQueryBuilder('movement')
      .innerJoinAndSelect('movement.stock', 'stock')
      .leftJoinAndSelect('movement.user', 'user')
      .leftJoin(Order, 'recordOrder', 'recordOrder.id = movement.orderId')
      .leftJoin(ProductionDelivery, 'productionDelivery', 'productionDelivery.id = movement.productionDeliveryId')
      .leftJoin(ProductionConsolidationDetail, 'productionDetail', 'productionDetail.id = productionDelivery.consolidatedDetailId')
      .leftJoin(ProductionConsolidation, 'productionOrder', 'productionOrder.id = productionDetail.consolidationId')
      .leftJoin(RouteDelivery, 'routeDelivery', 'routeDelivery.id = movement.routeDeliveryId')
      .leftJoin(DistributionRoute, 'route', 'route.id = routeDelivery.routeId')
      .addSelect('recordOrder.code', 'orderCode')
      .addSelect('productionOrder.code', 'productionCode')
      .addSelect('route.code', 'routeCode')
      .where('stock.presentationId = :presentationId', { presentationId: query.presentationId })
      .andWhere("CAST(movement.occurredAt AT TIME ZONE 'America/La_Paz' AS date) BETWEEN :from AND :to", query)
      .orderBy('movement.occurredAt', 'ASC')
      .addOrderBy('movement.id', 'ASC');
    const result = await builder.getRawAndEntities<MovementReferenceRaw>();
    const previous = await this.movements.createQueryBuilder('movement')
      .innerJoin('movement.stock', 'stock')
      .where('stock.presentationId = :presentationId', { presentationId: query.presentationId })
      .andWhere("CAST(movement.occurredAt AT TIME ZONE 'America/La_Paz' AS date) < :from", { from: query.from })
      .orderBy('movement.occurredAt', 'DESC').addOrderBy('movement.id', 'DESC').getOne();
    const metrics = summarizeKardex(result.entities, Number(previous?.newBalance ?? 0));
    return {
      from: query.from,
      to: query.to,
      generatedAt: new Date().toISOString(),
      generatedBy: actor.name,
      product: {
        presentationId: presentation.id,
        productCode: String(presentation.product.code),
        productName: presentation.product.name,
        presentationDescription: presentation.description,
        unitAbbreviation: presentation.unit.abbreviation,
        categoryName: presentation.product.category?.name ?? null,
        productLineName: presentation.product.productLine?.name ?? null,
      },
      metrics,
      movements: result.entities.map((movement, index) => {
        const amounts = movementAmounts(movement);
        return {
          id: movement.id,
          occurredAt: movement.occurredAt.toISOString(),
          type: movement.type,
          typeLabel: MOVEMENT_LABELS[movement.type],
          document: this.documentLabel(movement, result.raw[index]),
          reason: movement.reason,
          entry: amounts.entry,
          exit: amounts.exit,
          balance: Number(movement.newBalance),
          userName: movement.user?.name ?? 'Sistema',
        };
      }),
    };
  }

  async export(query: InventoryKardexQueryDto, format: InventoryKardexFormat, actor: AuthenticatedUser) {
    const report = await this.report(query, actor);
    const options = this.reportOptions(report);
    const content = format === InventoryKardexFormat.PDF ? await createIcarPdfReport(options) : await createIcarXlsxReport(options);
    await this.audit.record({
      userId: actor.id, module: 'inventory', action: 'EXPORTAR_KARDEX', entity: 'movimientos_inventario',
      entityId: query.presentationId, result: 'EXITOSO', metadata: { format, from: query.from, to: query.to },
    });
    const base = `icar-kardex-${report.product.productCode}-${query.from}-${query.to}`;
    return {
      filename: `${base}.${format === InventoryKardexFormat.PDF ? 'pdf' : 'xlsx'}`,
      mime: format === InventoryKardexFormat.PDF ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      content,
    };
  }

  private reportOptions(report: Awaited<ReturnType<InventoryKardexService['report']>>): IcarReportOptions {
    const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 6 });
    const dateTime = new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' });
    const date = (value: string) => new Intl.DateTimeFormat('es-BO', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
    const columns: IcarReportColumn[] = [
      { key: 'date', label: 'Fecha y hora', width: 60, excelWidth: 19, excelNumberFormat: 'dd/mm/yyyy hh:mm', align: 'center' },
      { key: 'type', label: 'Movimiento', width: 69, excelWidth: 20 },
      { key: 'document', label: 'Documento', width: 67, excelWidth: 20 },
      { key: 'reason', label: 'Motivo', width: 137, excelWidth: 38 },
      { key: 'entry', label: 'Ingreso', width: 45, excelWidth: 13, align: 'right' },
      { key: 'exit', label: 'Salida', width: 45, excelWidth: 13, align: 'right' },
      { key: 'balance', label: 'Saldo', width: 45, excelWidth: 13, align: 'right' },
      { key: 'user', label: 'Usuario', width: 80, excelWidth: 22 },
    ];
    const productLabel = `${report.product.productCode} · ${report.product.productName} · ${report.product.presentationDescription}`;
    return {
      title: 'Kardex de movimientos por producto', code: 'ALM-KARDEX', pdfLayout: 'portrait', worksheetName: 'Kardex',
      periodLabel: `${date(report.from)} al ${date(report.to)}`, contextLabel: 'Producto', filterLabel: productLabel,
      groupLabel: 'PRODUCTO', emptyMessage: 'No existen movimientos para el producto y rango seleccionados.', footerLabel: 'Kardex de Almacén',
      generatedBy: report.generatedBy, generatedAt: new Date(report.generatedAt), logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
      columns,
      metrics: [
        { label: 'Saldo inicial', value: number.format(report.metrics.openingBalance) },
        { label: 'Total ingresos', value: number.format(report.metrics.totalEntries) },
        { label: 'Total salidas', value: number.format(report.metrics.totalExits) },
        { label: 'Saldo final', value: number.format(report.metrics.closingBalance) },
      ],
      groups: report.movements.length ? [{
        title: productLabel,
        rows: report.movements.map((movement) => ({ values: {
          date: { display: dateTime.format(new Date(movement.occurredAt)), excel: excelBoliviaDate(movement.occurredAt) }, type: movement.typeLabel, document: movement.document,
          reason: movement.reason, entry: movement.entry || null, exit: movement.exit || null,
          balance: movement.balance, user: movement.userName,
        } })),
      }] : [],
    };
  }

  private documentLabel(movement: InventoryMovement, raw: MovementReferenceRaw): string {
    const parts: string[] = [];
    if (raw?.orderCode) parts.push(`Pedido ${raw.orderCode}`);
    if (raw?.productionCode) parts.push(`OP-${raw.productionCode}`);
    if (raw?.routeCode) parts.push(`Ruta ${raw.routeCode}`);
    if (!parts.length && movement.productionDeliveryId) parts.push('Entrega de Producción');
    return parts.join(' · ') || 'Movimiento manual';
  }

  private validateRange(query: InventoryKardexQueryDto): void {
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(query.from) || !pattern.test(query.to)) throw new BadRequestException('Las fechas deben usar el formato AAAA-MM-DD');
    if (query.from > query.to) throw new BadRequestException('La fecha Desde no puede ser posterior a la fecha Hasta');
  }
}

function excelBoliviaDate(value: string): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return new Date(Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')));
}
