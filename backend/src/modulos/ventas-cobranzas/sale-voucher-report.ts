import { join } from 'node:path';
import { createIcarPdfReport } from '../../compartido/reportes/icar-pdf-report';
import { IcarReportOptions } from '../../compartido/reportes/icar-report.types';
import { Sale } from './entidades/sale.entity';

export const INTERNAL_VOUCHER_LEGEND = 'DOCUMENTO INTERNO ICAR - NO CONSTITUYE FACTURA TRIBUTARIA';

export function createSaleVoucherReport(sale: Sale, voucherNumber: string, generatedBy: string): Promise<Buffer> {
  const options: IcarReportOptions = {
    title: 'Comprobante interno de venta',
    code: voucherNumber,
    pdfLayout: 'portrait',
    periodLabel: `Emisión: ${date(sale.issuedDate)} · Vencimiento: ${date(sale.dueDate)}`,
    contextLabel: 'Cliente',
    filterLabel: `${sale.customer.businessName} · Pedido ${sale.order.code}`,
    groupLabel: 'DETALLE',
    emptyMessage: 'La venta no contiene productos.',
    generatedBy,
    generatedAt: new Date(),
    logoPath: join(process.cwd(), 'assets', 'icar-logo.jpg'),
    metrics: [
      { label: 'Total', value: `Bs ${sale.total}` },
      { label: 'Saldo', value: `Bs ${sale.balance}` },
      { label: 'Estado', value: sale.status.replaceAll('_', ' ') },
      { label: 'Productos', value: sale.details.length },
    ],
    columns: [
      { key: 'product', label: 'Producto', width: 170 },
      { key: 'presentation', label: 'Presentación', width: 100 },
      { key: 'quantity', label: 'Cantidad', width: 70, align: 'right' },
      { key: 'price', label: 'Precio unitario', width: 90, align: 'right' },
      { key: 'subtotal', label: 'Subtotal', width: 118, align: 'right' },
    ],
    groups: sale.details.length ? [{
      title: `${INTERNAL_VOUCHER_LEGEND} · Cod-Venta ${sale.code}`,
      rows: sale.details.map((detail) => ({ values: {
        product: detail.productSnapshot,
        presentation: detail.presentationSnapshot,
        quantity: `${detail.deliveredQuantity} ${detail.unitSnapshot}`,
        price: `Bs ${detail.unitPrice}`,
        subtotal: `Bs ${detail.subtotal}`,
      } })),
    }] : [],
  };
  return createIcarPdfReport(options);
}

function date(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}
