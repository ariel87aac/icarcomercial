import {
  IcarReportColumn,
  IcarReportOptions,
} from "../../../compartido/reportes/icar-report.types";
import {
  ProductionConsolidationStatus,
  ProductionDetailStage,
} from "../dominio/production.enums";

export interface ProductionOrderReportRawRow {
  orderId: string;
  orderCode: number | string;
  orderStatus: ProductionConsolidationStatus;
  deliveryDate: string | Date;
  areaId: string | null;
  areaName: string | null;
  categoryName: string | null;
  productCode: string | number;
  productName: string;
  presentationDescription: string | null;
  unitAbbreviation: string;
  plannedQuantity: string;
  preparedQuantity: string;
  stage: ProductionDetailStage;
}

export interface ProductionOrderReport {
  order: {
    id: string;
    code: number;
    status: ProductionConsolidationStatus;
    deliveryDate: string;
  };
  generatedAt: string;
  generatedBy: string;
  metrics: {
    areaCount: number;
    productCount: number;
    completedCount: number;
    quantityByUnit: Array<{
      unit: string;
      requested: number;
      prepared: number;
    }>;
  };
  groups: Array<{
    areaId: string | null;
    areaName: string;
    rows: Array<{
      categoryName: string | null;
      productCode: string;
      productName: string;
      presentationDescription: string | null;
      unitAbbreviation: string;
      requestedQuantity: string;
      preparedQuantity: string;
      stage: ProductionDetailStage;
    }>;
  }>;
}

export function buildProductionOrderReport(
  rows: ProductionOrderReportRawRow[],
  generatedBy: string,
  generatedAt: Date,
): ProductionOrderReport {
  const first = rows[0];
  const groups = new Map<string, ProductionOrderReport["groups"][number]>();
  const totals = new Map<string, { requested: number; prepared: number }>();
  let completedCount = 0;
  for (const row of rows) {
    const key = row.areaId ?? "none";
    const group = groups.get(key) ?? {
      areaId: row.areaId,
      areaName: row.areaName ?? "Sin área asignada",
      rows: [],
    };
    group.rows.push({
      categoryName: row.categoryName,
      productCode: String(row.productCode),
      productName: row.productName,
      presentationDescription: row.presentationDescription,
      unitAbbreviation: row.unitAbbreviation,
      requestedQuantity: row.plannedQuantity,
      preparedQuantity: row.preparedQuantity,
      stage: row.stage,
    });
    groups.set(key, group);
    const total = totals.get(row.unitAbbreviation) ?? {
      requested: 0,
      prepared: 0,
    };
    total.requested = round(total.requested + Number(row.plannedQuantity));
    total.prepared = round(total.prepared + Number(row.preparedQuantity));
    totals.set(row.unitAbbreviation, total);
    if (
      [
        ProductionDetailStage.COMPLETED,
        ProductionDetailStage.CLOSED_WITH_INCIDENT,
      ].includes(row.stage)
    ) {
      completedCount += 1;
    }
  }
  return {
    order: {
      id: first.orderId,
      code: Number(first.orderCode),
      status: first.orderStatus,
      deliveryDate: dateKey(first.deliveryDate),
    },
    generatedAt: generatedAt.toISOString(),
    generatedBy,
    metrics: {
      areaCount: groups.size,
      productCount: rows.length,
      completedCount,
      quantityByUnit: [...totals].map(([unit, quantities]) => ({
        unit,
        ...quantities,
      })),
    },
    groups: [...groups.values()].sort((left, right) =>
      left.areaName.localeCompare(right.areaName, "es"),
    ),
  };
}

export function buildProductionOrderReportOptions(
  report: ProductionOrderReport,
  logoPath: string,
): IcarReportOptions {
  const columns: IcarReportColumn[] = [
    {
      key: "code",
      label: "Código",
      width: 48,
      excelWidth: 11,
      align: "center",
    },
    { key: "product", label: "Producto", width: 148, excelWidth: 28 },
    { key: "presentation", label: "Presentación", width: 125, excelWidth: 24 },
    { key: "category", label: "Categoría", width: 90, excelWidth: 18 },
    {
      key: "requested",
      label: "Cantidad solicitada",
      width: 80,
      excelWidth: 18,
      align: "right",
    },
    {
      key: "prepared",
      label: "Cantidad preparada",
      width: 80,
      excelWidth: 18,
      align: "right",
    },
    {
      key: "unit",
      label: "Unidad",
      width: 52,
      excelWidth: 11,
      align: "center",
    },
    {
      key: "stage",
      label: "Estado",
      width: 75,
      excelWidth: 20,
      align: "center",
    },
  ];
  return {
    title: `Reporte por orden de producción OP-${report.order.code}`,
    code: "PROD-ORDEN",
    worksheetName: `OP-${report.order.code}`,
    periodLabel: `Entrega ${longDateOnly(report.order.deliveryDate)}`,
    contextLabel: "Orden / estado",
    filterLabel: `OP-${report.order.code} · ${STATUS_LABELS[report.order.status]}`,
    groupLabel: "Área",
    emptyMessage: "La orden no contiene productos autorizados.",
    footerLabel: `Reporte OP-${report.order.code}`,
    generatedBy: report.generatedBy,
    generatedAt: new Date(report.generatedAt),
    logoPath,
    columns,
    metrics: [
      { label: "Orden de producción", value: `OP-${report.order.code}` },
      { label: "Productos solicitados", value: report.metrics.productCount },
      { label: "Productos completados", value: report.metrics.completedCount },
    ],
    groups: report.groups.map((group) => ({
      title: group.areaName,
      rows: group.rows.map((row) => ({
        values: {
          code: row.productCode,
          product: row.productName,
          presentation: row.presentationDescription ?? "Sin presentación",
          category: row.categoryName ?? "Sin categoría",
          requested: quantityCell(row.requestedQuantity),
          prepared: quantityCell(row.preparedQuantity),
          unit: row.unitAbbreviation,
          stage: STAGE_LABELS[row.stage],
        },
      })),
    })),
  };
}

const STATUS_LABELS: Record<ProductionConsolidationStatus, string> = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  EN_PROCESO: "En proceso",
  CERRADA: "Completada",
  CANCELADA: "Cancelada",
  CERRADA_INCOMPLETA: "Completada con faltantes",
};

const STAGE_LABELS: Record<ProductionDetailStage, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  PENDIENTE_RECEPCION: "Pendiente recepción",
  RECIBIDO_PARCIAL: "Recibido parcial",
  COMPLETADO: "Completado",
  CERRADO_CON_INCIDENCIA: "Completado con incidencia",
  CANCELADO: "Cancelado",
};

function quantityCell(value: string) {
  const quantity = round(Number(value));
  return {
    display: new Intl.NumberFormat("es-BO", {
      maximumFractionDigits: 6,
    }).format(quantity),
    excel: quantity,
  };
}

function round(value: number): number {
  return (
    Math.round((Number.isFinite(value) ? value : 0) * 1_000_000) / 1_000_000
  );
}

function longDateOnly(value: string): string {
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function dateKey(value: string | Date): string {
  if (typeof value === "string") return value.slice(0, 10);
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, "0"),
    String(value.getUTCDate()).padStart(2, "0"),
  ].join("-");
}
