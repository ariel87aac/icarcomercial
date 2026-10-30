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
import { ProductionTrackingParte01 } from './production-tracking.01-ngOnInit';

@Component({
  selector: "app-production-tracking",
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: "./production-tracking.component.html",
  styleUrls: [
    "./production-tracking.estructura.css",
    "./production-tracking.detalle.css",
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionTrackingComponent extends ProductionTrackingParte01 {}
