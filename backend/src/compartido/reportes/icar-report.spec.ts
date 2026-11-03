import * as ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createIcarPdfReport } from './icar-pdf-report';
import { IcarReportOptions } from './icar-report.types';
import { createIcarXlsxReport } from './icar-xlsx-report';

const report: IcarReportOptions = {
  title: 'Reporte diario de producción',
  code: 'PROD-DIARIO',
  periodLabel: '1 de noviembre de 2026',
  filterLabel: 'Panadería',
  generatedBy: 'Administrador',
  generatedAt: new Date('2026-11-01T16:00:00.000Z'),
  logoPath: '/ruta/no-existente/logo.jpg',
  columns: [
    { key: 'code', label: 'Código', width: 120, excelWidth: 15 },
    { key: 'product', label: 'Producto', width: 400, excelWidth: 40 },
    { key: 'quantity', label: 'Producido', width: 208, excelWidth: 18, align: 'right' },
  ],
  metrics: [{ label: 'Productos elaborados', value: 1 }],
  groups: [{ title: 'Panadería', rows: [{ values: { code: '1001', product: 'Pan molde', quantity: 10 } }] }],
};

describe('plantilla institucional de reportes ICAR', () => {
  it('genera un PDF válido en formato carta horizontal', async () => {
    const pdf = await createIcarPdfReport(report);
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 792 612]');
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it('genera el Kardex en carta vertical cuando la plantilla lo solicita', async () => {
    const pdf = await createIcarPdfReport({ ...report, pdfLayout: 'portrait' });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 612 792]');
  });

  it('inicia cada grupo en una página diferente cuando el reporte lo solicita', async () => {
    const pdf = await createIcarPdfReport({
      ...report,
      pageBreakBetweenGroups: true,
      groups: [
        report.groups[0],
        { title: 'Cárnicos', rows: [{ values: { code: '2001', product: 'Jamón', quantity: 8 } }] },
      ],
    });
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(2);
  });

  it('genera un Excel con datos numéricos y configuración de impresión horizontal', async () => {
    const output = await createIcarXlsxReport(report);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(output).buffer);
    const sheet = workbook.getWorksheet('Producción diaria');

    expect(sheet).toBeDefined();
    expect(sheet?.pageSetup.orientation).toBe('landscape');
    expect(sheet?.pageSetup.fitToWidth).toBe(1);
    expect(sheet?.getCell('A12').value).toBe('Código');
    expect(sheet?.getCell('C14').value).toBe(10);
  });

  it('admite una hoja Kardex con fecha Excel real y formato visible independiente', async () => {
    const output = await createIcarXlsxReport({
      ...report,
      worksheetName: 'Kardex',
      columns: [
        { key: 'date', label: 'Fecha', width: 180, excelNumberFormat: 'dd/mm/yyyy hh:mm' },
        { key: 'product', label: 'Producto', width: 360 },
        { key: 'quantity', label: 'Cantidad', width: 188 },
      ],
      groups: [{ title: 'Producto', rows: [{ values: {
        date: { display: '1/11/26, 09:30', excel: new Date('2026-11-01T09:30:00.000Z') }, product: 'Croissant', quantity: 10,
      } }] }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(output).buffer);
    const sheet = workbook.getWorksheet('Kardex');

    expect(sheet?.getCell('A14').value).toBeInstanceOf(Date);
    expect(sheet?.getCell('A14').numFmt).toBe('dd/mm/yyyy hh:mm');
  });
});
