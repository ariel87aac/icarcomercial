import { HttpErrorResponse } from '@angular/common/http';
import { ProductionConsolidation, ProductionConsolidationDetail } from '../../../../../compartido/modelos';
import { ProductionTrackingBase } from './production-tracking.base';

import { Directive } from '@angular/core';

@Directive()
export abstract class ProductionTrackingParte02 extends ProductionTrackingBase {
  protected override number(value: number | string): string {
      return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 6 }).format(
        Number(value),
      );
    }

  protected override pending(detail: ProductionConsolidationDetail): number {
      return Math.max(
        0,
        Number(detail.plannedQuantity) - Number(detail.receivedQuantity),
      );
    }

  protected override completedProducts(order: ProductionConsolidation): number {
      return order.details.filter((detail) =>
        ["COMPLETADO", "CERRADO_CON_INCIDENCIA"].includes(detail.stage),
      ).length;
    }

  protected override pendingReceipts(order: ProductionConsolidation): number {
      return order.details.reduce(
        (total, detail) =>
          total + detail.deliveries.filter((delivery) => delivery.status === "PENDIENTE").length,
        0,
      );
    }

  protected override detailProgress(detail: ProductionConsolidationDetail): number {
      const planned = Number(detail.plannedQuantity);
      if (planned <= 0) return 0;
      const current = Math.max(
        Number(detail.preparedQuantity),
        Number(detail.receivedQuantity),
      );
      return Math.min(100, Math.max(0, (current / planned) * 100));
    }

  protected override date(value: string | null, time = true): string {
      if (!value) return "—";
      return new Intl.DateTimeFormat(
        "es-BO",
        time
          ? { dateStyle: "medium", timeStyle: "short" }
          : { dateStyle: "medium" },
      ).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
    }

  protected override milestones(
      order: ProductionConsolidation,
    ): { label: string; at: string | null; current: boolean }[] {
      const startedAt =
        order.details
          .map((detail) => detail.startedAt)
          .filter((at): at is string => !!at)
          .sort()[0] ??
        this.history().find((event) => event.event === "INICIO")?.occurredAt ??
        null;
      return [
        {
          label: "Borrador",
          at: order.createdAt,
          current: order.status === "BORRADOR",
        },
        {
          label: "Emitida",
          at: order.emittedAt,
          current: order.status === "EMITIDA",
        },
        {
          label: "En proceso",
          at: startedAt,
          current: order.status === "EN_PROCESO",
        },
        {
          label:
            order.status === "CANCELADA" || order.status === "CERRADA_INCOMPLETA"
              ? this.statusLabel(order.status)
              : "Completada",
          at: order.canceledAt ?? order.closedAt,
          current: ["CERRADA", "CERRADA_INCOMPLETA", "CANCELADA"].includes(
            order.status,
          ),
        },
      ];
    }

  protected override errorMessage(error: unknown): string {
      if (!(error instanceof HttpErrorResponse))
        return "No se pudo actualizar el seguimiento.";
      const message = error.error?.message;
      return Array.isArray(message)
        ? message.join(". ")
        : message || "No se pudo actualizar el seguimiento. Intente nuevamente.";
    }
}
