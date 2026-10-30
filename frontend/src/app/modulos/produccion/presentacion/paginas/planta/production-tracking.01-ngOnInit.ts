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
import { ProductionTrackingParte02 } from './production-tracking.02-number';

import { Directive } from '@angular/core';

@Directive()
export abstract class ProductionTrackingParte01 extends ProductionTrackingParte02 {
  override ngOnInit(): void {
      merge(timer(0, 30_000), this.refreshList)
        .pipe(
          switchMap(() => {
            this.loading.set(true);
            return this.http
              .get<Paginated<ProductionTrackingOrder>>(
                "/api/production-consolidations/tracking",
                {
                  params: this.appliedParams
                    .set("page", this.page())
                    .set("limit", this.pageSize()),
                },
              )
              .pipe(
                catchError((error) => {
                  this.loading.set(false);
                  this.listError.set(this.errorMessage(error));
                  return EMPTY;
                }),
              );
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe((response) => {
          this.orders.set(response.data);
          this.total.set(response.meta.total);
          this.loading.set(false);
          this.listError.set("");
          this.updatedAt.set(new Date().toISOString());
        });
  
      merge(timer(30_000, 30_000), this.refreshDetail)
        .pipe(
          switchMap(() => {
            const id = this.selectedId;
            if (!id) return EMPTY;
            this.detailLoading.set(true);
            this.historyError.set("");
            const history = this.auth.can("production.history.read")
              ? this.http
                  .get<
                    ProductionHistory[]
                  >(`/api/production-consolidations/${id}/history`)
                  .pipe(
                    catchError((error) => {
                      this.historyError.set(this.errorMessage(error));
                      return of(null);
                    }),
                  )
              : of([] as ProductionHistory[]);
            return forkJoin({
              order: this.http.get<ProductionConsolidation>(
                `/api/production-consolidations/${id}`,
              ),
              history,
            }).pipe(
              catchError((error) => {
                this.detailLoading.set(false);
                this.detailError.set(this.errorMessage(error));
                return EMPTY;
              }),
            );
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(({ order, history }) => {
          this.selected.set(order);
          this.history.set(history ?? []);
          this.detailLoading.set(false);
          this.detailError.set("");
          this.detailUpdatedAt.set(new Date().toISOString());
        });
    }

  protected override applyFilters(): void {
      if (this.code !== null && (!Number.isInteger(this.code) || this.code < 1)) {
        this.listError.set("Ingrese un código de orden entero mayor que cero.");
        return;
      }
      let params = new HttpParams();
      if (this.code) params = params.set("code", this.code);
      if (this.deliveryDate)
        params = params.set("deliveryDate", this.deliveryDate);
      if (this.statuses.length)
        params = params.set("statuses", this.statuses.join(","));
      this.appliedParams = params;
      this.page.set(1);
      this.orders.set([]);
      this.refreshList.next();
    }

  protected override onPage(event: TableLazyLoadEvent): void {
      this.pageSize.set(event.rows ?? 30);
      this.page.set(Math.floor((event.first ?? 0) / this.pageSize()) + 1);
      this.refreshList.next();
    }

  protected override refresh(): void {
      this.refreshList.next();
      this.refreshDetail.next();
    }

  protected override open(order: ProductionTrackingOrder): void {
      this.selectedId = order.id;
      this.selected.set(null);
      this.history.set([]);
      this.detailError.set("");
      this.detailUpdatedAt.set(null);
      this.dialog.set(true);
      this.refreshDetail.next();
    }

  protected override close(): void {
      this.dialog.set(false);
      this.selectedId = null;
      this.refreshDetail.next();
    }

  protected override statusLabel(status: ProductionConsolidationStatus): string {
      return STATUS_LABELS[status];
    }

  protected override eventLabel(event: ProductionHistory["event"]): string {
      return EVENT_LABELS[event] ?? event;
    }

  protected override severity(
      status: ProductionConsolidationStatus,
    ): "success" | "danger" | "warn" | "info" | "secondary" {
      return status === "CERRADA"
        ? "success"
        : status === "CANCELADA"
          ? "danger"
          : status === "CERRADA_INCOMPLETA" || status === "EN_PROCESO"
            ? "warn"
            : status === "EMITIDA"
              ? "info"
              : "secondary";
    }

  protected override stageLabel(stage: ProductionDetailStage): string {
      return {
        PENDIENTE: "Pendiente de inicio",
        EN_PROCESO: "En producción",
        PENDIENTE_RECEPCION: "Pendiente de recepción",
        RECIBIDO_PARCIAL: "Recibido parcialmente",
        COMPLETADO: "Completado",
        CERRADO_CON_INCIDENCIA: "Completado con incidencia",
        CANCELADO: "Cancelado",
      }[stage];
    }

  protected override stageSeverity(
      stage: ProductionDetailStage,
    ): "success" | "danger" | "warn" | "info" | "secondary" {
      return stage === "COMPLETADO"
        ? "success"
        : stage === "CANCELADO"
          ? "danger"
          : stage === "PENDIENTE_RECEPCION" || stage === "CERRADO_CON_INCIDENCIA"
            ? "warn"
            : stage === "PENDIENTE"
              ? "secondary"
              : "info";
    }

  protected override nextAction(order: ProductionTrackingOrder): string {
      if (order.status === "BORRADOR") return "Revisar el plan y emitir a planta";
      if (order.status === "EMITIDA") return "Iniciar los productos en planta";
      if (order.status === "CANCELADA") return "Orden cancelada";
      if (order.status === "CERRADA_INCOMPLETA")
        return "Cierre con faltantes documentados";
      if (order.status === "CERRADA") return "Orden completada y recibida";
      if (order.tracking.pendingReceiptCount)
        return "Almacén debe recibir las entregas pendientes";
      if (order.tracking.incidentCount || order.tracking.canceledCount)
        return "Revisar incidencias y productos pendientes";
      return "Continuar la producción y registrar entregas";
    }

  protected override percent(value: number | null): string {
      return value === null
        ? "Sin cantidad planificada"
        : `${this.number(value)} %`;
    }
}
