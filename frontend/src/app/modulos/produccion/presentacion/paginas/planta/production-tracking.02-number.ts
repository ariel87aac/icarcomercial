import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ButtonModule } from "primeng/button";
import { DialogModule } from "primeng/dialog";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
import { TableModule } from "primeng/table";
import { TagModule } from "primeng/tag";
import { TableLazyLoadEvent } from "primeng/types/table";
import {
  EMPTY,
  Subject,
  catchError,
  forkJoin,
  merge,
  of,
  switchMap,
  timer,
} from "rxjs";
import { AuthService } from "../../../../../nucleo/autenticacion/auth.service";
import {
  Paginated,
  ProductionConsolidation,
  ProductionConsolidationDetail,
  ProductionConsolidationStatus,
  ProductionDetailStage,
  ProductionHistory,
  ProductionTrackingOrder,
} from "../../../../../compartido/modelos";

const STATUS_LABELS: Record<ProductionConsolidationStatus, string> = {
  BORRADOR: "Borrador",
  EMITIDA: "Emitida",
  EN_PROCESO: "En proceso",
  CERRADA: "Completada",
  CERRADA_INCOMPLETA: "Completada con faltantes",
  CANCELADA: "Cancelada",
};
const EVENT_LABELS: Record<ProductionHistory["event"], string> = {
  GENERACION: "Orden generada",
  RECALCULO: "Plan recalculado",
  AJUSTE_LOTE: "Ajuste de lote",
  PRODUCCION_ADICIONAL: "Producción adicional",
  PRODUCTO_AGREGADO: "Producto agregado",
  PRODUCTO_RETIRADO: "Producto retirado",
  PROGRAMACION: "Programación actualizada",
  EMISION: "Orden emitida a planta",
  INICIO: "Producción iniciada",
  AVANCE: "Avance registrado",
  ENTREGA_PRODUCCION: "Entrega enviada a Almacén",
  RECEPCION_ALMACEN: "Recepción en Almacén",
  CANCELACION_PRODUCTO: "Producto cancelado",
  CANCELACION_ORDEN: "Orden cancelada",
  CIERRE_INCOMPLETO: "Orden completada con faltantes",
  CIERRE: "Orden completada",
};
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
