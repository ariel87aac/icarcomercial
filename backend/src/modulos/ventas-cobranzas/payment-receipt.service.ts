import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { AuthenticatedUser } from '../../compartido/interfaces/authenticated-user.interface';
import { createIcarPdfReport } from '../../compartido/reportes/icar-pdf-report';
import { IcarReportOptions } from '../../compartido/reportes/icar-report.types';
import { AuditService } from '../seguridad/auditoria/audit.service';
import { Payment } from './entidades/payment.entity';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentReceiptService {
  constructor(
    private readonly payments: PaymentService,
    private readonly audit: AuditService,
  ) {}

  async export(id: string, actor: AuthenticatedUser) {
    const payment = await this.payments.findOne(id, actor);
    const content = await createIcarPdfReport(buildPaymentReceipt(payment, actor));
    await this.audit.record({
      userId: actor.id,
      module: 'commercial',
      action: 'EXPORTAR_COMPROBANTE_COBRO',
      entity: 'pagos',
      entityId: payment.id,
      result: 'EXITOSO',
      metadata: { paymentCode: payment.code, customerId: payment.customerId, amount: payment.amount },
    });
    return { filename: `icar-cobro-${payment.code}.pdf`, mime: 'application/pdf', content };
  }
}

function buildPaymentReceipt(payment: Payment, actor: AuthenticatedUser): IcarReportOptions {
  const reference = payment.reference || 'Sin referencia';
  const observation = payment.observation || 'Sin observaciones';
  return {
    title: `Comprobante de cobranza N.º ${payment.code}`,
    code: `COBRO-${payment.code}`,
    pdfLayout: 'portrait',
    periodLabel: `Fecha: ${date(payment.paymentDate)} · ${observation}`,
    contextLabel: 'Cliente',
    filterLabel: `${payment.customer.businessName} · NIT/CI: ${payment.customer.taxId || 'No registrado'}`,
    groupLabel: 'Cobranza',
    emptyMessage: 'El cobro no tiene notas aplicadas.',
    generatedBy: actor.name,
    generatedAt: new Date(),
    logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    metrics: [
      { label: 'Importe cobrado', value: `Bs ${payment.amount}` },
      { label: 'Estado', value: payment.status.replaceAll('_', ' ') },
      { label: 'Medio de pago', value: payment.paymentMethod.name },
      { label: 'Referencia', value: reference },
    ],
    columns: [
      { key: 'sale', label: 'Cod-Venta', width: 74 },
      { key: 'order', label: 'Cod-Pedido', width: 94 },
      { key: 'issued', label: 'Emisión', width: 80 },
      { key: 'due', label: 'Vencimiento', width: 80 },
      { key: 'voucher', label: 'Comprobante', width: 110 },
      { key: 'amount', label: 'Importe aplicado', width: 110, align: 'right' },
    ],
    groups: payment.applications?.length ? [{
      title: `${payment.applications.length} nota(s) aplicada(s) · ${observation}`,
      rows: payment.applications.map((application) => ({ values: {
        sale: application.sale.code,
        order: application.sale.order?.code ?? '—',
        issued: date(application.sale.issuedDate),
        due: date(application.sale.dueDate),
        voucher: voucher(application.sale),
        amount: `Bs ${application.appliedAmount}`,
      } })),
    }] : [],
  };
}

function voucher(sale: Payment['applications'][number]['sale']): string {
  if (!sale.voucher) return 'Sin comprobante';
  return `${sale.voucher.series?.series ?? 'ICAR'}-${String(sale.voucher.number).padStart(8, '0')}`;
}

function date(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}
