import { describe, expect, it } from 'vitest';
import { ProductionConsolidationStatus } from '../dominio/production.enums';
import { buildProductionPlanningReport, ProductionPlanningRawRow } from './production-planning-report';
import { ProductionPlanningReportMode } from './production-report.dto';

const rows: ProductionPlanningRawRow[] = [
  planningRow({ scheduledDate: new Date('2026-11-03T00:00:00.000Z'), sequence: 2, plannedQuantity: '10' }),
  planningRow({ scheduledDate: '2026-11-02', sequence: 1, plannedQuantity: '2.5' }),
  planningRow({
    areaId: 'area-2',
    areaName: 'Cárnicos',
    categoryName: 'Cerdo',
    productId: 'product-2',
    productCode: 20,
    productName: 'Jamón',
    presentationId: 'presentation-2',
    presentationDescription: 'Bolsa 1 kg',
    plannedQuantity: '8',
  }),
];

describe('reporte PDF de planificación de Producción', () => {
  it('consolida la cantidad de un producto presente en varias órdenes', () => {
    const report = build(ProductionPlanningReportMode.TOTAL);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0].rows).toHaveLength(2);
    expect(report.groups[0].rows[0].values.code).toBe('10');
    expect(report.groups[0].rows[0].values.quantity).toBe(12.5);
    expect(report.metrics).toEqual([
      { label: 'Orden de producción', value: 'OP-7' },
      { label: 'Productos planificados', value: 2 },
      { label: 'Áreas involucradas', value: 2 },
    ]);
  });

  it('divide por áreas y respeta fecha, secuencia y orden de producción', () => {
    const report = build(ProductionPlanningReportMode.AREAS);
    expect(report.pageBreakBetweenGroups).toBe(true);
    expect(report.groups.map((group) => group.title)).toEqual(['Cárnicos', 'Panadería']);
    expect(report.groups[1].rows.map((row) => row.values.order)).toEqual([7, 7]);
    expect(report.groups[1].rows.map((row) => row.values.date)).toEqual(['02/11/2026', '03/11/2026']);
  });
});

function build(mode: ProductionPlanningReportMode) {
  return buildProductionPlanningReport({
    rows,
    mode,
    generatedBy: 'Responsable de Producción',
    generatedAt: new Date('2026-11-02T16:00:00.000Z'),
    logoPath: '/ruta/no-existente/logo.jpg',
  });
}

function planningRow(overrides: Partial<ProductionPlanningRawRow>): ProductionPlanningRawRow {
  return {
    orderId: 'order-7',
    orderCode: 7,
    orderStatus: ProductionConsolidationStatus.DRAFT,
    deliveryDate: new Date('2026-11-04T00:00:00.000Z'),
    scheduledDate: '2026-11-02',
    sequence: 1,
    productId: 'product-1',
    presentationId: 'presentation-1',
    baseUnitId: 'unit-1',
    productCode: 10,
    productName: 'Pan molde',
    presentationDescription: 'Bolsa 500 g',
    categoryName: 'Panadería',
    areaId: 'area-1',
    areaName: 'Panadería',
    unitAbbreviation: 'BOL',
    plannedQuantity: '1',
    ...overrides,
  };
}
