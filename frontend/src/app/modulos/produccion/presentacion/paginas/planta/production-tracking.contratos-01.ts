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

import { Directive } from '@angular/core';

@Directive()
export abstract class ProductionTrackingContratos01 {
  abstract ngOnInit(): void;

  protected abstract applyFilters(): void;

  protected abstract onPage(event: TableLazyLoadEvent): void;

  protected abstract refresh(): void;

  protected abstract open(order: ProductionTrackingOrder): void;

  protected abstract close(): void;

  protected abstract statusLabel(status: ProductionConsolidationStatus): string;

  protected abstract eventLabel(event: ProductionHistory["event"]): string;

  protected abstract severity(status: ProductionConsolidationStatus): "success" | "danger" | "warn" | "info" | "secondary";

  protected abstract stageLabel(stage: ProductionDetailStage): string;

  protected abstract stageSeverity(stage: ProductionDetailStage): "success" | "danger" | "warn" | "info" | "secondary";

  protected abstract nextAction(order: ProductionTrackingOrder): string;

  protected abstract percent(value: number | null): string;

  protected abstract number(value: number | string): string;

  protected abstract pending(detail: ProductionConsolidationDetail): number;

  protected abstract date(value: string | null, time: boolean): string;

  protected abstract milestones(order: ProductionConsolidation): {
      label: string;
      at: string | null;
      current: boolean;
  }[];

  protected abstract errorMessage(error: unknown): string;
}
