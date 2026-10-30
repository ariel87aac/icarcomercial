import { ProductionConsolidationDetail } from "./entities/production-consolidation-detail.entity";
import {
  ProductionDeliveryStatus,
  ProductionDetailStage,
} from "./entities/production.enums";

type TrackingDetail = Pick<
  ProductionConsolidationDetail,
  | "plannedQuantity"
  | "preparedQuantity"
  | "receivedQuantity"
  | "stage"
  | "deliveries"
>;

export function productionTrackingSummary(details: TrackingDetail[]) {
  const planned = details.filter(
    (detail) => Number(detail.plannedQuantity) > 0,
  );
  // Promediar el cumplimiento por presentación evita sumar kg, bolsas y unidades.
  // Un excedente en un producto nunca compensa el faltante de otro.
  const percent = (key: "preparedQuantity" | "receivedQuantity") =>
    planned.length
      ? Math.round(
          (planned.reduce(
            (sum, detail) =>
              sum +
              Math.min(
                1,
                Math.max(
                  0,
                  Number(detail[key]) / Number(detail.plannedQuantity),
                ),
              ),
            0,
          ) /
            planned.length) *
            1000,
        ) / 10
      : null;
  return {
    productCount: details.length,
    completedCount: details.filter(
      (detail) => detail.stage === ProductionDetailStage.COMPLETED,
    ).length,
    incidentCount: details.filter(
      (detail) => detail.stage === ProductionDetailStage.CLOSED_WITH_INCIDENT,
    ).length,
    canceledCount: details.filter(
      (detail) => detail.stage === ProductionDetailStage.CANCELLED,
    ).length,
    pendingReceiptCount: details.reduce(
      (sum, detail) =>
        sum +
        detail.deliveries.filter(
          (delivery) => delivery.status === ProductionDeliveryStatus.PENDING,
        ).length,
      0,
    ),
    producedPercent: percent("preparedQuantity"),
    receivedPercent: percent("receivedQuantity"),
  };
}
