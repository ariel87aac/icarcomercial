import { existsSync } from 'node:fs';
import { IcarReportOptions, IcarReportValue } from './icar-report.types';

const ExcelJS = require('exceljs') as typeof import('exceljs');

const BLUE = '07599C';
const DARK_BLUE = '063B79';
const LIGHT_BLUE = 'EAF4FB';
const RED = 'E42420';
const WHITE = 'FFFFFF';
const BORDER = 'D7E1E8';

export async function createIcarXlsxReport(options: IcarReportOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ICAR';
  workbook.created = options.generatedAt;
  const sheet = workbook.addWorksheet(options.worksheetName ?? 'Producción diaria', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 12, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = options.columns.map((column) => ({ key: column.key, width: column.excelWidth ?? Math.max(Math.round(column.width / 7), 8) }));
  sheet.mergeCells(1, 3, 2, options.columns.length);
  sheet.getCell(1, 3).value = options.title;
  sheet.getCell(1, 3).font = { name: 'Arial', size: 16, bold: true, color: { argb: WHITE } };
  sheet.getCell(1, 3).alignment = { vertical: 'middle', horizontal: 'left' };
  const codeStart = options.columns.length > 4 ? options.columns.length - 1 : options.columns.length;
  if (codeStart > 3) sheet.mergeCells(3, 3, 3, codeStart - 1);
  sheet.getCell(3, 3).value = 'Industria Cárnica Arancibia - ICAR';
  sheet.getCell(3, 3).font = { name: 'Arial', size: 9, color: { argb: WHITE } };
  sheet.getCell(3, 3).alignment = { vertical: 'middle', horizontal: 'left' };
  if (codeStart < options.columns.length) sheet.mergeCells(3, codeStart, 3, options.columns.length);
  sheet.getCell(3, codeStart).value = options.code;
  sheet.getCell(3, codeStart).font = { name: 'Arial', size: 8, bold: true, color: { argb: WHITE } };
  sheet.getCell(3, codeStart).alignment = { horizontal: 'right' };
  sheet.mergeCells(1, 1, 3, 2);
  sheet.getCell(1, 1).value = null;
  for (let row = 1; row <= 3; row += 1) {
    for (let column = 1; column <= options.columns.length; column += 1) sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
  }
  if (existsSync(options.logoPath)) {
    const imageId = workbook.addImage({ filename: options.logoPath, extension: 'jpeg' });
    sheet.addImage(imageId, { tl: { col: 0.2, row: 0.15 }, ext: { width: 50, height: 50 } });
  }
  for (let column = 1; column <= options.columns.length; column += 1) sheet.getCell(4, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  sheet.getCell('A6').value = 'Período';
  sheet.getCell('B6').value = options.periodLabel;
  sheet.getCell('A7').value = options.contextLabel ?? 'Áreas';
  sheet.getCell('B7').value = options.filterLabel;
  sheet.getCell('F6').value = 'Generado por';
  sheet.getCell('G6').value = options.generatedBy;
  sheet.getCell('F7').value = 'Fecha de generación';
  sheet.getCell('G7').value = options.generatedAt.toLocaleString('es-BO', { timeZone: 'America/La_Paz' });
  ['A6', 'A7', 'F6', 'F7'].forEach((address) => { sheet.getCell(address).font = { name: 'Arial', size: 9, bold: true, color: { argb: DARK_BLUE } }; });
  ['B6', 'B7', 'G6', 'G7'].forEach((address) => { sheet.getCell(address).font = { name: 'Arial', size: 9, color: { argb: '465B6D' } }; });
  options.metrics.forEach((metric, index) => {
    const start = Math.floor((index * options.columns.length) / options.metrics.length) + 1;
    const end = Math.max(start, Math.floor(((index + 1) * options.columns.length) / options.metrics.length));
    sheet.mergeCells(9, start, 9, end);
    sheet.mergeCells(10, start, 10, end);
    sheet.getCell(9, start).value = metric.label.toUpperCase();
    sheet.getCell(10, start).value = metric.value;
    [9, 10].forEach((row) => {
      for (let column = start; column <= end; column += 1) sheet.getCell(row, column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
    });
    sheet.getCell(9, start).font = { name: 'Arial', size: 8, bold: true, color: { argb: '657789' } };
    sheet.getCell(10, start).font = { name: 'Arial', size: 14, bold: true, color: { argb: DARK_BLUE } };
  });
  const headerRow = sheet.getRow(12);
  headerRow.values = options.columns.map((column) => column.label);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  let rowNumber = 13;
  for (const group of options.groups) {
    sheet.mergeCells(rowNumber, 1, rowNumber, options.columns.length);
    const groupCell = sheet.getCell(rowNumber, 1);
    groupCell.value = `${options.groupLabel ?? 'ÁREA'}: ${group.title}`;
    groupCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D7EBF7' } };
    groupCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: DARK_BLUE } };
    rowNumber += 1;
    for (const item of group.rows) {
      const row = sheet.getRow(rowNumber);
      row.values = options.columns.map((column) => excelValue(item.values[column.key]));
      row.height = 21;
      row.eachCell((cell, columnNumber) => {
        const column = options.columns[columnNumber - 1];
        cell.font = { name: 'Arial', size: 9, color: { argb: '203040' }, bold: column.key === 'quantity' };
        cell.alignment = { vertical: 'middle', horizontal: column.align ?? 'left', wrapText: true };
        if (column.excelNumberFormat) cell.numFmt = column.excelNumberFormat;
        cell.border = { bottom: { style: 'thin', color: { argb: BORDER } } };
      });
      rowNumber += 1;
    }
  }
  if (!options.groups.length) {
    sheet.mergeCells(rowNumber, 1, rowNumber + 1, options.columns.length);
    sheet.getCell(rowNumber, 1).value = options.emptyMessage ?? 'No existen entregas de Producción para los filtros seleccionados.';
    sheet.getCell(rowNumber, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  }
  sheet.pageSetup.printArea = `A1:${sheet.getColumn(options.columns.length).letter}${Math.max(rowNumber, 15)}`;
  sheet.pageSetup.printTitlesRow = '1:12';
  sheet.headerFooter.oddFooter = `&LICAR - ${options.footerLabel ?? 'Reporte de Producción'}&RPágina &P de &N`;
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}

function excelValue(value: IcarReportValue) {
  return value && typeof value === 'object' && !(value instanceof Date) && 'excel' in value ? value.excel : value;
}
