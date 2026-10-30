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
import { AuthService } from "../core/auth.service";
import {
  Paginated,
  ProductionConsolidation,
  ProductionConsolidationDetail,
  ProductionConsolidationStatus,
  ProductionDetailStage,
  ProductionHistory,
  ProductionTrackingOrder,
} from "../core/models";

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
  styleUrl: "./production-tracking.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionTrackingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly refreshList = new Subject<void>();
  private readonly refreshDetail = new Subject<void>();
  private selectedId: string | null = null;
  private appliedParams = new HttpParams();
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

  ngOnInit(): void {
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

  protected applyFilters(): void {
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

  protected onPage(event: TableLazyLoadEvent): void {
    this.pageSize.set(event.rows ?? 30);
    this.page.set(Math.floor((event.first ?? 0) / this.pageSize()) + 1);
    this.refreshList.next();
  }

  protected refresh(): void {
    this.refreshList.next();
    this.refreshDetail.next();
  }

  protected open(order: ProductionTrackingOrder): void {
    this.selectedId = order.id;
    this.selected.set(null);
    this.history.set([]);
    this.detailError.set("");
    this.detailUpdatedAt.set(null);
    this.dialog.set(true);
    this.refreshDetail.next();
  }

  protected close(): void {
    this.dialog.set(false);
    this.selectedId = null;
    this.refreshDetail.next();
  }

  protected statusLabel(status: ProductionConsolidationStatus): string {
    return STATUS_LABELS[status];
  }
  protected eventLabel(event: ProductionHistory["event"]): string {
    return EVENT_LABELS[event] ?? event;
  }
  protected severity(
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
  protected stageLabel(stage: ProductionDetailStage): string {
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
  protected stageSeverity(
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
  protected nextAction(order: ProductionTrackingOrder): string {
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
  protected percent(value: number | null): string {
    return value === null
      ? "Sin cantidad planificada"
      : `${this.number(value)} %`;
  }
  protected number(value: number | string): string {
    return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 6 }).format(
      Number(value),
    );
  }
  protected pending(detail: ProductionConsolidationDetail): number {
    return Math.max(
      0,
      Number(detail.plannedQuantity) - Number(detail.receivedQuantity),
    );
  }
  protected date(value: string | null, time = true): string {
    if (!value) return "—";
    return new Intl.DateTimeFormat(
      "es-BO",
      time
        ? { dateStyle: "medium", timeStyle: "short" }
        : { dateStyle: "medium" },
    ).format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
  }
  protected milestones(
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
  private errorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse))
      return "No se pudo actualizar el seguimiento.";
    const message = error.error?.message;
    return Array.isArray(message)
      ? message.join(". ")
      : message || "No se pudo actualizar el seguimiento. Intente nuevamente.";
  }
}
