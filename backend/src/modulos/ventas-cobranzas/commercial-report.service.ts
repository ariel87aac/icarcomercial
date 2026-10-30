import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { paginate } from '../../compartido/dto/pagination-query.dto';
import { centsToMoney, moneyToCents } from './commercial-calculations';
import { CommercialReportQueryDto, ReceivableQueryDto } from './dto/commercial.dto';
import { CommercialReportType, PaymentStatus, ReportFormat, SaleStatus } from './entidades/commercial.enums';
import { Payment } from './entidades/payment.entity';
import { Sale } from './entidades/sale.entity';
import { ReceivablesService } from './receivables.service';
import { createSimplePdf } from './simple-pdf';

@Injectable()
export class CommercialReportService {
  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly receivables: ReceivablesService,
    private readonly audit: AuditService,
  ) {}

  async report(type: CommercialReportType, query: CommercialReportQueryDto) {
    if (type === CommercialReportType.SALES) return this.salesReport(query);
    if (type === CommercialReportType.PAYMENTS) return this.paymentsReport(query);
    if (type === CommercialReportType.RECEIVABLES) {
      return this.receivables.findAll(Object.assign(new ReceivableQueryDto(), {
        customerId: query.customerId,
        zoneId: query.zoneId,
        cutoffDate: query.cutoffDate,
        page: query.page,
        limit: query.limit,
      }));
    }
    return this.traceabilityReport(query);
  }

  async export(type: CommercialReportType, format: ReportFormat, query: CommercialReportQueryDto, actor: AuthenticatedUser): Promise<{ filename: string; mime: string; content: Buffer }> {
    const report = await this.report(type, { ...query, page: 1, limit: Number.MAX_SAFE_INTEGER });
    const rows = this.flattenReport(type, report);
    const stamp = new Date().toISOString().slice(0, 10);
    let content: Buffer;
    let mime: string;
    let extension: string;
    if (format === ReportFormat.CSV) {
      const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => this.csvCell(row[header])).join(','))].join('\n');
      content = Buffer.from(`\uFEFF${csv}`, 'utf8');
      mime = 'text/csv; charset=utf-8';
      extension = 'csv';
    } else {
      const lines = rows.length ? rows.flatMap((row) => [Object.entries(row).map(([key, value]) => `${key}: ${String(value ?? '')}`).join(' | ')]) : ['Sin resultados para los filtros seleccionados'];
      content = createSimplePdf(`ICAR - Reporte ${type}`, lines);
      mime = 'application/pdf';
      extension = 'pdf';
    }
    await this.audit.record({ userId: actor.id, module: 'commercial', action: 'EXPORTAR_REPORTE', entity: 'reportes_comerciales', entityId: type, result: 'EXITOSO', metadata: { type, format, filters: query } });
    return { filename: `icar-${type.toLowerCase()}-${stamp}.${extension}`, mime, content };
  }

  private async salesReport(query: CommercialReportQueryDto) {
    const builder = this.sales.createQueryBuilder('sale')
      .innerJoinAndSelect('sale.customer', 'customer')
      .innerJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .leftJoinAndSelect('sale.voucher', 'voucher')
      .leftJoinAndSelect('voucher.series', 'series')
      .orderBy('sale.code', 'DESC');
    this.saleFilters(builder, query);
    const data = await builder.getMany();
    const included = data.filter((sale) => sale.status !== SaleStatus.VOIDED);
    const page = paginate(data.slice((query.page - 1) * query.limit, query.page * query.limit), data.length, query.page, query.limit);
    return { ...page, totals: { count: included.length, total: centsToMoney(included.reduce((sum, sale) => sum + moneyToCents(sale.total), 0)), balance: centsToMoney(included.reduce((sum, sale) => sum + moneyToCents(sale.balance), 0)) } };
  }

  private async paymentsReport(query: CommercialReportQueryDto) {
    const builder = this.payments.createQueryBuilder('payment')
      .innerJoinAndSelect('payment.customer', 'customer')
      .innerJoinAndSelect('payment.paymentMethod', 'paymentMethod')
      .leftJoinAndSelect('payment.applications', 'application')
      .leftJoinAndSelect('application.sale', 'sale')
      .leftJoinAndSelect('sale.order', 'orders')
      .leftJoinAndSelect('orders.address', 'address')
      .leftJoinAndSelect('address.zone', 'zone')
      .orderBy('payment.paymentDate', 'DESC');
    if (query.customerId) builder.andWhere('payment.customerId = :customerId', { customerId: query.customerId });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.paymentStatus) builder.andWhere('payment.status = :paymentStatus', { paymentStatus: query.paymentStatus });
    if (query.from) builder.andWhere('payment.paymentDate >= :from', { from: query.from.slice(0, 10) });
    if (query.to) builder.andWhere('payment.paymentDate <= :to', { to: query.to.slice(0, 10) });
    const data = await builder.getMany();
    const included = data.filter((payment) => payment.status === PaymentStatus.CONFIRMED);
    const page = paginate(data.slice((query.page - 1) * query.limit, query.page * query.limit), data.length, query.page, query.limit);
    return { ...page, totals: { count: included.length, total: centsToMoney(included.reduce((sum, payment) => sum + moneyToCents(payment.amount), 0)) } };
  }

  private async traceabilityReport(query: CommercialReportQueryDto) {
    const sales = await this.salesReport(query);
    return {
      data: sales.data.map((sale) => ({
        saleCode: sale.code,
        orderCode: sale.order.code,
        customer: sale.customer.businessName,
        saleStatus: sale.status,
        total: sale.total,
        balance: sale.balance,
        voucher: sale.voucher ? `${sale.voucher.series.series}-${String(sale.voucher.number).padStart(8, '0')}` : null,
      })),
      totals: sales.totals,
      meta: sales.meta,
    };
  }

  private saleFilters(builder: ReturnType<Repository<Sale>['createQueryBuilder']>, query: CommercialReportQueryDto): void {
    if (query.customerId) builder.andWhere('sale.customerId = :customerId', { customerId: query.customerId });
    if (query.zoneId) builder.andWhere('address.zoneId = :zoneId', { zoneId: query.zoneId });
    if (query.saleStatus) builder.andWhere('sale.status = :saleStatus', { saleStatus: query.saleStatus });
    if (query.from) builder.andWhere('sale.issuedDate >= :from', { from: query.from.slice(0, 10) });
    if (query.to) builder.andWhere('sale.issuedDate <= :to', { to: query.to.slice(0, 10) });
  }

  private flattenReport(type: CommercialReportType, report: any): Record<string, unknown>[] {
    if (type === CommercialReportType.SALES) return report.data.map((sale: Sale) => ({ codVenta: sale.code, codPedido: sale.order.code, cliente: sale.customer.businessName, fechaEmision: sale.issuedDate, fechaVencimiento: sale.dueDate, total: sale.total, estado: sale.status }));
    if (type === CommercialReportType.PAYMENTS) return report.data.map((payment: Payment) => ({ codCobro: payment.code, cliente: payment.customer.businessName, fecha: payment.paymentDate, medio: payment.paymentMethod.name, referencia: payment.reference, observacion: payment.observation, estado: payment.status, importe: payment.amount }));
    if (type === CommercialReportType.RECEIVABLES) return report.data.map((row: any) => ({ codVenta: row.sale.code, cliente: row.sale.customer.businessName, vencimiento: row.sale.dueDate, estado: row.receivableStatus, diasMora: row.daysPastDue, antiguedad: row.agingRange, saldo: row.sale.balance }));
    return report.data;
  }

  private csvCell(value: unknown): string {
    const text = value == null ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }
}
