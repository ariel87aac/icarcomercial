import { Sale } from '../../ventas-cobranzas/entidades/sale.entity';
import { DistributionDeliveryType, VisitResultType } from '../entidades/distribution.enums';
import { RouteDelivery } from '../entidades/route-delivery.entity';

const PDFDocument = require('pdfkit') as typeof import('pdfkit');
const PAGE_WIDTH = 80 / 25.4 * 72;
const MARGIN = 10;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface ThermalDeliveryTicketContext {
  delivery: RouteDelivery;
  sale: Sale | null;
  generatedBy: string;
  generatedAt: Date;
}

export interface ThermalDeliveryTicketItem {
  code: string;
  description: string;
  presentation: string;
  unit: string;
  prepared: number;
  delivered: number;
  returned: number;
  unitPrice: number;
  subtotal: number;
}

export interface ThermalDeliveryTicketModel {
  title: string;
  orderCode: string;
  route: string;
  deliveryMode: string;
  customer: string;
  taxId: string;
  phone: string;
  address: string;
  zone: string;
  requestedDate: string;
  paymentCondition: string;
  result: string;
  observation: string;
  responsible: string;
  saleCode: string;
  dueDate: string;
  items: ThermalDeliveryTicketItem[];
  total: number;
  generatedBy: string;
  generatedAt: Date;
}

export function buildThermalDeliveryTicket(context: ThermalDeliveryTicketContext): ThermalDeliveryTicketModel {
  const { delivery, sale } = context;
  const resultByDetail = new Map((delivery.result?.details ?? []).map((item) => [item.preparationDetailId, item]));
  const items = delivery.preparation.details.map((detail) => {
    const result = resultByDetail.get(detail.id);
    const delivered = result ? Number(result.deliveredQuantity) : Number(detail.preparedQuantity);
    const unitPrice = Number(detail.orderDetail.unitPrice);
    return {
      code: String(detail.orderDetail.presentation.product?.code ?? '—'),
      description: detail.orderDetail.productDescriptionSnapshot,
      presentation: detail.orderDetail.presentationDescriptionSnapshot,
      unit: detail.orderDetail.unitAbbreviationSnapshot,
      prepared: Number(detail.preparedQuantity),
      delivered,
      returned: Number(result?.returnedQuantity ?? 0),
      unitPrice,
      subtotal: delivered * unitPrice,
    };
  });
  const customer = delivery.order.customer;
  const principal = delivery.route?.responsibles?.find((item) => item.isPrincipal)?.user.name;
  return {
    title: ticketTitle(delivery),
    orderCode: delivery.order.code,
    route: delivery.route?.code ?? 'ENTREGA EN FÁBRICA',
    deliveryMode: delivery.deliveryType === DistributionDeliveryType.FACTORY ? 'FÁBRICA' : 'REPARTO',
    customer: delivery.order.customerNameSnapshot || customer.businessName,
    taxId: customer.taxId || 'No registrado',
    phone: customer.phone,
    address: delivery.deliveryType === DistributionDeliveryType.FACTORY ? 'Entrega directa en planta ICAR' : delivery.address.address,
    zone: delivery.address.zone?.name || delivery.order.zoneSnapshot || 'Sin zona',
    requestedDate: date(delivery.order.requestedDate),
    paymentCondition: `${customer.paymentCondition}${customer.paymentCondition === 'CREDITO' ? ` - ${customer.creditDays} días` : ''}`,
    result: resultLabel(delivery.result?.result),
    observation: delivery.result?.observation || 'Sin observaciones',
    responsible: delivery.result?.user?.name || principal || context.generatedBy,
    saleCode: sale ? String(sale.code) : 'Pendiente de entrega',
    dueDate: sale ? date(sale.dueDate) : '—',
    items,
    total: items.reduce((sum, item) => sum + item.subtotal, 0),
    generatedBy: context.generatedBy,
    generatedAt: context.generatedAt,
  };
}

export function createThermalDeliveryTicketPdf(model: ThermalDeliveryTicketModel): Promise<Buffer> {
  const doc = new PDFDocument({ autoFirstPage: false, bufferPages: true, info: { Title: model.title, Author: 'ICAR' } });
  doc.font('Helvetica');
  const height = ticketHeight(doc, model);
  doc.addPage({ size: [PAGE_WIDTH, height], margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  drawTicket(doc, model);
  doc.end();
  return result;
}

function drawTicket(doc: PDFKit.PDFDocument, model: ThermalDeliveryTicketModel): void {
  let y = MARGIN;
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(20).text('ICAR', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 1;
  doc.fontSize(7.5).text('INDUSTRIA CÁRNICA ARANCIBIA', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 1;
  doc.font('Helvetica').fontSize(7).text('Sabor & Calidad', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = rule(doc, doc.y + 6);
  doc.font('Helvetica-Bold').fontSize(10).text(model.title, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = rule(doc, doc.y + 6);
  y = field(doc, y, 'Pedido', model.orderCode);
  y = field(doc, y, 'Ruta', model.route);
  y = field(doc, y, 'Modalidad', model.deliveryMode);
  y = field(doc, y, 'Entrega comprometida', model.requestedDate);
  y = rule(doc, y + 3);
  y = field(doc, y, 'Cliente', model.customer);
  y = field(doc, y, 'NIT/CI', model.taxId);
  y = field(doc, y, 'Teléfono', model.phone);
  y = field(doc, y, 'Domicilio', model.address);
  y = field(doc, y, 'Zona', model.zone);
  y = field(doc, y, 'Condición', model.paymentCondition);
  y = rule(doc, y + 3);
  doc.font('Helvetica-Bold').fontSize(7.5).text('PRODUCTOS', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 4;
  model.items.forEach((item, index) => { y = drawItem(doc, item, index + 1, y); });
  y = rule(doc, y + 1);
  y = totalLine(doc, y, 'Líneas de producto', String(model.items.length));
  y = totalLine(doc, y, 'IMPORTE ENTREGADO', money(model.total), true);
  y = rule(doc, y + 3);
  y = field(doc, y, 'Resultado', model.result);
  y = field(doc, y, 'Responsable', model.responsible);
  y = field(doc, y, 'Cod-Venta', model.saleCode);
  y = field(doc, y, 'Vencimiento', model.dueDate);
  y = field(doc, y, 'Observación', model.observation);
  y = rule(doc, y + 3);
  doc.font('Helvetica').fontSize(7).text('RECIBÍ CONFORME', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 24;
  doc.moveTo(MARGIN + 28, y).lineTo(PAGE_WIDTH - MARGIN - 28, y).lineWidth(0.6).strokeColor('#000').stroke();
  doc.fontSize(6.5).text('Firma / sello del cliente', MARGIN, y + 3, { width: CONTENT_WIDTH, align: 'center' });
  y = doc.y + 5;
  doc.fontSize(6.3).text(`Generado por ${model.generatedBy}`, MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  doc.text(dateTime(model.generatedAt), MARGIN, doc.y + 1, { width: CONTENT_WIDTH, align: 'center' });
  doc.font('Helvetica-Bold').fontSize(6.2).text('DOCUMENTO INTERNO - NO CONSTITUYE FACTURA', MARGIN, doc.y + 4, { width: CONTENT_WIDTH, align: 'center' });
}

function drawItem(doc: PDFKit.PDFDocument, item: ThermalDeliveryTicketItem, index: number, y: number): number {
  doc.font('Helvetica-Bold').fontSize(7.4).text(`${index}. [${item.code}] ${item.description}`, MARGIN, y, { width: CONTENT_WIDTH });
  y = doc.y + 1;
  doc.font('Helvetica').fontSize(6.7).text(item.presentation, MARGIN, y, { width: CONTENT_WIDTH });
  y = doc.y + 2;
  doc.fontSize(6.8).text(`${quantity(item.delivered)} ${item.unit} x ${money(item.unitPrice)}`, MARGIN, y, { width: CONTENT_WIDTH * 0.65 });
  doc.font('Helvetica-Bold').text(money(item.subtotal), MARGIN + CONTENT_WIDTH * 0.65, y, { width: CONTENT_WIDTH * 0.35, align: 'right' });
  y = Math.max(doc.y, y + 9);
  if (item.returned > 0) {
    doc.font('Helvetica').fontSize(6.4).text(`Preparado: ${quantity(item.prepared)} | Retorna: ${quantity(item.returned)}`, MARGIN, y, { width: CONTENT_WIDTH });
    y = doc.y;
  }
  return rule(doc, y + 4, '#B0B0B0');
}

function field(doc: PDFKit.PDFDocument, y: number, label: string, value: string): number {
  doc.font('Helvetica-Bold').fontSize(6.8).text(`${label}:`, MARGIN, y, { width: 62 });
  doc.font('Helvetica').text(value, MARGIN + 62, y, { width: CONTENT_WIDTH - 62 });
  return Math.max(doc.y, y + 8) + 2;
}

function totalLine(doc: PDFKit.PDFDocument, y: number, label: string, value: string, prominent = false): number {
  doc.font('Helvetica-Bold').fontSize(prominent ? 8.5 : 7).text(label, MARGIN, y, { width: CONTENT_WIDTH * 0.62 });
  doc.text(value, MARGIN + CONTENT_WIDTH * 0.62, y, { width: CONTENT_WIDTH * 0.38, align: 'right' });
  return doc.y + 3;
}

function rule(doc: PDFKit.PDFDocument, y: number, color = '#000'): number {
  doc.save().dash(2, { space: 2 }).moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.5).strokeColor(color).stroke().restore();
  return y + 5;
}

function ticketHeight(doc: PDFKit.PDFDocument, model: ThermalDeliveryTicketModel): number {
  const wrapped = [model.route, model.customer, model.address, model.observation, ...model.items.flatMap((item) => [item.description, item.presentation])];
  doc.font('Helvetica').fontSize(7);
  const wrapHeight = wrapped.reduce((sum, value) => sum + doc.heightOfString(value, { width: CONTENT_WIDTH - 62 }), 0);
  const itemBase = model.items.reduce((sum, item) => sum + 33 + (item.returned > 0 ? 9 : 0), 0);
  return Math.max(500, 385 + wrapHeight + itemBase);
}

function ticketTitle(delivery: RouteDelivery): string {
  if (!delivery.result) return 'NOTA PREVIA DE ENTREGA';
  if (delivery.result.result === VisitResultType.DELIVERED) return 'COMPROBANTE DE ENTREGA';
  if (delivery.result.result === VisitResultType.PARTIAL) return 'COMPROBANTE DE ENTREGA PARCIAL';
  return 'CONSTANCIA DE PEDIDO NO ENTREGADO';
}

function resultLabel(result?: VisitResultType): string {
  if (!result) return 'PENDIENTE DE ENTREGA';
  return result.replaceAll('_', ' ');
}

function quantity(value: number): string { return new Intl.NumberFormat('es-BO', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value); }
function money(value: number): string { return `Bs ${new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`; }
function date(value: string): string { const [year, month, day] = value.slice(0, 10).split('-'); return day && month && year ? `${day}/${month}/${year}` : value; }
function dateTime(value: Date): string { return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(value); }
