import { describe, expect, it } from "vitest";
import {
  ProductionConsolidationStatus,
  ProductionDetailStage,
} from "../dominio/production.enums";
import {
  buildProductionOrderReport,
  buildProductionOrderReportOptions,
  ProductionOrderReportRawRow,
} from "./production-order-report";

const rows: ProductionOrderReportRawRow[] = [
  orderRow({
    plannedQuantity: "10",
    preparedQuantity: "8",
    stage: ProductionDetailStage.IN_PROGRESS,
  }),
  orderRow({
    areaId: "area-2",
    areaName: "Cárnicos",
    categoryName: "Cerdo",
    productCode: 20,
    productName: "Jamón",
    unitAbbreviation: "KG",
    plannedQuantity: "4.5",
    preparedQuantity: "4.5",
    stage: ProductionDetailStage.COMPLETED,
  }),
];

describe("reporte por orden de Producción", () => {
  it("compara la cantidad solicitada a planta con la cantidad preparada", () => {
    const report = buildProductionOrderReport(
      rows,
      "Jefe de Producción",
      new Date("2026-11-02T16:00:00Z"),
    );
    expect(report.order).toMatchObject({
      code: 12,
      status: ProductionConsolidationStatus.IN_PROGRESS,
    });
    expect(report.groups[1].rows[0]).toMatchObject({
      requestedQuantity: "10",
      preparedQuantity: "8",
    });
    expect(report.metrics).toMatchObject({
      areaCount: 2,
      productCount: 2,
      completedCount: 1,
    });
    expect(report.metrics.quantityByUnit).toEqual([
      { unit: "BOL", requested: 10, prepared: 8 },
      { unit: "KG", requested: 4.5, prepared: 4.5 },
    ]);
  });

  it("genera la tabla institucional con valores numéricos para Excel", () => {
    const report = buildProductionOrderReport(
      rows,
      "Jefe de Producción",
      new Date("2026-11-02T16:00:00Z"),
    );
    const options = buildProductionOrderReportOptions(
      report,
      "/logo-no-existente.jpg",
    );
    expect(options.title).toContain("OP-12");
    expect(options.groups.map((group) => group.title)).toEqual([
      "Cárnicos",
      "Panadería",
    ]);
    expect(options.groups[1].rows[0].values.requested).toEqual({
      display: "10",
      excel: 10,
    });
    expect(options.groups[1].rows[0].values.prepared).toEqual({
      display: "8",
      excel: 8,
    });
  });
});

function orderRow(
  overrides: Partial<ProductionOrderReportRawRow>,
): ProductionOrderReportRawRow {
  return {
    orderId: "order-12",
    orderCode: 12,
    orderStatus: ProductionConsolidationStatus.IN_PROGRESS,
    deliveryDate: "2026-11-05",
    areaId: "area-1",
    areaName: "Panadería",
    categoryName: "Panadería",
    productCode: 10,
    productName: "Pan molde",
    presentationDescription: "Bolsa 500 g",
    unitAbbreviation: "BOL",
    plannedQuantity: "1",
    preparedQuantity: "0",
    stage: ProductionDetailStage.PENDING,
    ...overrides,
  };
}
