import { describe, expect, it } from "vitest";
import { ProductionConsolidationDetail } from "./entidades/production-consolidation-detail.entity";
import { ProductionDelivery } from "./entidades/production-delivery.entity";
import {
  ProductionDeliveryStatus,
  ProductionDetailStage,
} from "./entidades/production.enums";
import { productionTrackingSummary } from "./production-tracking";

function detail(
  plan: number,
  produced: number,
  received: number,
  stage = ProductionDetailStage.IN_PROGRESS,
) {
  return {
    plannedQuantity: String(plan),
    preparedQuantity: String(produced),
    receivedQuantity: String(received),
    stage,
    deliveries: [] as ProductionDelivery[],
  } as ProductionConsolidationDetail;
}

describe("seguimiento de órdenes de producción", () => {
  it("separa lo producido de lo aceptado por Almacén", () => {
    const row = detail(10, 10, 4, ProductionDetailStage.PENDING_RECEIPT);
    row.deliveries = [
      { status: ProductionDeliveryStatus.ACCEPTED },
      { status: ProductionDeliveryStatus.PENDING },
    ] as ProductionDelivery[];
    expect(productionTrackingSummary([row])).toMatchObject({
      producedPercent: 100,
      receivedPercent: 40,
      pendingReceiptCount: 1,
    });
  });

  it("promedia porcentajes por presentación sin sumar unidades incompatibles", () => {
    expect(
      productionTrackingSummary([detail(1000, 500, 250), detail(2, 2, 1)]),
    ).toMatchObject({ producedPercent: 75, receivedPercent: 37.5 });
  });

  it("un excedente no compensa un faltante de otro producto", () => {
    expect(
      productionTrackingSummary([detail(10, 20, 20), detail(10, 0, 0)]),
    ).toMatchObject({ producedPercent: 50, receivedPercent: 50 });
  });

  it("conserva el faltante aunque el producto se cancele o cierre con incidencia", () => {
    expect(
      productionTrackingSummary([
        detail(10, 0, 0, ProductionDetailStage.CANCELLED),
        detail(10, 8, 7, ProductionDetailStage.CLOSED_WITH_INCIDENT),
        detail(10, 10, 10, ProductionDetailStage.COMPLETED),
      ]),
    ).toMatchObject({
      productCount: 3,
      canceledCount: 1,
      incidentCount: 1,
      completedCount: 1,
      producedPercent: 60,
      receivedPercent: 56.7,
    });
  });

  it("no divide por cero ni muestra 100 % cuando no existe cantidad planificada", () => {
    expect(productionTrackingSummary([]).receivedPercent).toBeNull();
    expect(
      productionTrackingSummary([detail(0, 0, 0)]).producedPercent,
    ).toBeNull();
    expect(
      productionTrackingSummary([detail(0, 0, 0), detail(10, 5, 2)]),
    ).toMatchObject({
      productCount: 2,
      producedPercent: 50,
      receivedPercent: 20,
    });
  });
});
