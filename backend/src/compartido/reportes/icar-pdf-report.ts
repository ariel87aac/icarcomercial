import { existsSync } from 'node:fs';
import { IcarReportColumn, IcarReportOptions, IcarReportRow, IcarReportValue } from './icar-report.types';

const PDFDocument = require('pdfkit') as typeof import('pdfkit');

const COLORS = {
  blue: '#07599C',
  darkBlue: '#063B79',
  lightBlue: '#EAF4FB',
  red: '#E42420',
  text: '#203040',
  muted: '#657789',
  border: '#D7E1E8',
  white: '#FFFFFF',
};
const MARGIN = 32;

function compactPage(doc: PDFKit.PDFDocument): boolean { return doc.page.width < 700; }
function contentBottom(doc: PDFKit.PDFDocument): number { return doc.page.height - 60; }

function drawHeader(doc: PDFKit.PDFDocument, options: IcarReportOptions, compact: boolean): number {
  doc.rect(0, 0, doc.page.width, 82).fill(COLORS.darkBlue);
  doc.rect(0, 0, doc.page.width, 5).fill(COLORS.red);
  doc.roundedRect(MARGIN, 15, 58, 56, 7).fill(COLORS.white);
  if (existsSync(options.logoPath)) doc.image(options.logoPath, MARGIN + 2, 17, { fit: [54, 52] });
  const portrait = compactPage(doc);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(compact ? 14 : portrait ? 15 : 18)
    .text(options.title, 104, 21, { width: doc.page.width - 284, lineBreak: false, ellipsis: true });
  doc.font('Helvetica').fontSize(8.5)
    .text('Industria Cárnica Arancibia - ICAR', 104, 47, { width: portrait ? 250 : 350, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(8)
    .text(options.code, doc.page.width - 170, 26, { width: 138, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(7.5)
    .text(compact ? 'Continuación' : options.periodLabel, doc.page.width - 250, 47, { width: 218, align: 'right', lineBreak: false });
  return 94;
}

function drawContext(doc: PDFKit.PDFDocument, options: IcarReportOptions, y: number): number {
  const contextX = compactPage(doc) ? 284 : 300;
  doc.fillColor(COLORS.text).font('Helvetica-Bold').fontSize(8).text('PERÍODO', MARGIN, y);
  doc.fillColor(COLORS.muted).font('Helvetica').text(options.periodLabel, MARGIN + 52, y, { width: contextX - MARGIN - 62, lineBreak: false, ellipsis: true });
  doc.fillColor(COLORS.text).font('Helvetica-Bold').text((options.contextLabel ?? 'ÁREAS').toUpperCase(), contextX, y);
  doc.fillColor(COLORS.muted).font('Helvetica').text(options.filterLabel, contextX + 50, y, { width: doc.page.width - contextX - MARGIN - 50, lineBreak: false, ellipsis: true });
  const metricY = y + 22;
  const gap = 10;
  const width = (doc.page.width - MARGIN * 2 - gap * Math.max(options.metrics.length - 1, 0)) / Math.max(options.metrics.length, 1);
  options.metrics.forEach((metric, index) => {
    const x = MARGIN + index * (width + gap);
    doc.roundedRect(x, metricY, width, 42, 6).fillAndStroke(COLORS.lightBlue, '#C7DEEC');
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.5).text(metric.label.toUpperCase(), x + 10, metricY + 8, { width: width - 20 });
    doc.fillColor(COLORS.darkBlue).font('Helvetica-Bold').fontSize(14).text(String(metric.value), x + 10, metricY + 20, { width: width - 20 });
  });
  return metricY + 55;
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: IcarReportColumn[], y: number): number {
  let x = MARGIN;
  doc.rect(MARGIN, y, columns.reduce((sum, column) => sum + column.width, 0), 24).fill(COLORS.blue);
  for (const column of columns) {
    const padding = compactPage(doc) ? 3 : 4;
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(compactPage(doc) ? 5.4 : 6.2)
      .text(column.label.toUpperCase(), x + padding, y + 8, { width: column.width - padding * 2, align: column.align ?? 'left', lineBreak: false, ellipsis: true });
    x += column.width;
  }
  return y + 24;
}

function rowHeight(doc: PDFKit.PDFDocument, columns: IcarReportColumn[], row: IcarReportRow, maximum = 36): number {
  const padding = compactPage(doc) ? 3 : 4;
  doc.font('Helvetica').fontSize(compactPage(doc) ? 5.8 : 6.8);
  const height = columns.reduce((maximum, column) => {
    const text = displayValue(row.values[column.key]);
    return Math.max(maximum, doc.heightOfString(text, { width: column.width - padding * 2, align: column.align ?? 'left' }) + 9);
  }, 21);
  return Math.min(Math.max(height, 21), maximum);
}

function drawRow(doc: PDFKit.PDFDocument, columns: IcarReportColumn[], row: IcarReportRow, y: number, alternate: boolean, maximum?: number): number {
  const height = rowHeight(doc, columns, row, maximum);
  if (alternate) doc.rect(MARGIN, y, columns.reduce((sum, column) => sum + column.width, 0), height).fill('#F7FAFC');
  let x = MARGIN;
  const padding = compactPage(doc) ? 3 : 4;
  for (const column of columns) {
    doc.fillColor(COLORS.text).font(column.key === 'quantity' ? 'Helvetica-Bold' : 'Helvetica').fontSize(compactPage(doc) ? 5.8 : 6.8)
      .text(displayValue(row.values[column.key]), x + padding, y + 6, { width: column.width - padding * 2, height: height - 7, align: column.align ?? 'left', ellipsis: true });
    doc.moveTo(x, y + height).lineTo(x + column.width, y + height).strokeColor(COLORS.border).lineWidth(0.4).stroke();
    x += column.width;
  }
  return y + height;
}

function drawGroup(doc: PDFKit.PDFDocument, title: string, columns: IcarReportColumn[], y: number, groupLabel = 'ÁREA'): number {
  const width = columns.reduce((sum, column) => sum + column.width, 0);
  doc.rect(MARGIN, y, width, 20).fill('#D7EBF7');
  doc.fillColor(COLORS.darkBlue).font('Helvetica-Bold').fontSize(7.2)
    .text(`${groupLabel}: ${title}`, MARGIN + 7, y + 6, { width: width - 14, lineBreak: false, ellipsis: true });
  return y + 20;
}

export function createIcarPdfReport(options: IcarReportOptions): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', layout: options.pdfLayout ?? 'landscape', margins: { top: 0, right: MARGIN, bottom: 30, left: MARGIN }, bufferPages: true, info: { Title: options.title, Author: 'ICAR' } });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  let y = drawContext(doc, options, drawHeader(doc, options, false));
  y = drawTableHeader(doc, options.columns, y);
  let alternate = false;
  if (!options.groups.length) {
    const tableWidth = options.columns.reduce((sum, column) => sum + column.width, 0);
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(9).text(options.emptyMessage ?? 'No existen entregas de Producción para los filtros seleccionados.', MARGIN, y + 22, { width: tableWidth, align: 'center' });
  }
  for (const [groupIndex, group] of options.groups.entries()) {
    if (options.pageBreakBetweenGroups && groupIndex > 0) {
      doc.addPage();
      y = drawTableHeader(doc, options.columns, drawHeader(doc, options, true));
    } else if (y + 44 > contentBottom(doc)) {
      doc.addPage();
      y = drawTableHeader(doc, options.columns, drawHeader(doc, options, true));
    }
    y = drawGroup(doc, group.title, options.columns, y, options.groupLabel);
    for (const row of group.rows) {
      const required = rowHeight(doc, options.columns, row, options.maxPdfRowHeight);
      if (y + required > contentBottom(doc)) {
        doc.addPage();
        y = drawTableHeader(doc, options.columns, drawHeader(doc, options, true));
        y = drawGroup(doc, `${group.title} (continuación)`, options.columns, y, options.groupLabel);
      }
      y = drawRow(doc, options.columns, row, y, alternate, options.maxPdfRowHeight);
      alternate = !alternate;
    }
  }
  const pages = doc.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    doc.switchToPage(index);
    const footerLineY = doc.page.height - 46;
    const footerTextY = doc.page.height - 41;
    doc.moveTo(MARGIN, footerLineY).lineTo(doc.page.width - MARGIN, footerLineY).strokeColor('#BFD4E1').lineWidth(0.6).stroke();
    doc.fillColor(COLORS.muted).font('Helvetica').fontSize(6.5)
      .text(`Generado por ${options.generatedBy} · ${options.generatedAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}`, MARGIN, footerTextY, { width: doc.page.width - 190, lineBreak: false });
    doc.text(`Página ${index - pages.start + 1} de ${pages.count}`, doc.page.width - 140, footerTextY, { width: 108, align: 'right', lineBreak: false });
  }
  doc.end();
  return result;
}

function displayValue(value: IcarReportValue): string {
  return value && typeof value === 'object' && !(value instanceof Date) && 'display' in value ? value.display : String(value ?? '');
}
