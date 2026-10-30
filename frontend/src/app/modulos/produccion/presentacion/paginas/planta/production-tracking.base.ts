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
import { ProductionTrackingContratos01 } from './production-tracking.contratos-01';

@Directive()
export abstract class ProductionTrackingBase extends ProductionTrackingContratos01 {
protected readonly http = inject(HttpClient);

  protected readonly destroyRef = inject(DestroyRef);

  protected readonly auth = inject(AuthService);

  protected readonly refreshList = new Subject<void>();

  protected readonly refreshDetail = new Subject<void>();

  protected selectedId: string | null = null;

  protected appliedParams = new HttpParams();

  protected readonly orders = signal<ProductionTrackingOrder[]>([]);

  protected readonly selected = signal<ProductionConsolidation | null>(null);

  protected readonly history = signal<ProductionHistory[]>([]);

  protected readonly loading = signal(false);

  protected readonly detailLoading = signal(false);

  protected readonly dialog = signal(false);

  protected readonly listError = signal("");

  protected readonly detailError = signal("");

  protected readonly historyError = signal("");

  protected readonly updatedAt = signal<string | null>(null);

  protected readonly detailUpdatedAt = signal<string | null>(null);

  protected readonly page = signal(1);

  protected readonly pageSize = signal(30);

  protected readonly total = signal(0);

  protected readonly statusOptions = Object.entries(STATUS_LABELS).map(
      ([value, label]) => ({ value, label }),
    );

  protected code: number | null = null;

  protected deliveryDate = "";

  protected statuses: ProductionConsolidationStatus[] = [];
}
