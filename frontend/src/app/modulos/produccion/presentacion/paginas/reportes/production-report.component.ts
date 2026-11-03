import {
  HttpClient,
  HttpErrorResponse,
  HttpParams,
} from "@angular/common/http";
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MessageService } from "primeng/api";
import { ButtonModule } from "primeng/button";
import { InputTextModule } from "primeng/inputtext";
import { MultiSelectModule } from "primeng/multiselect";
import { SelectModule } from "primeng/select";
import {
  DailyProductionReport,
  ProductionOrderReport,
  ProductionOrderReportOption,
  ProductionReportArea,
} from "../../../../../compartido/modelos";

type ReportType = "DAILY" | "ORDER";

@Component({
  selector: "app-production-report",
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
  ],
  templateUrl: "./production-report.component.html",
  styleUrl: "./production-report.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  protected readonly reportTypes = [
    { label: "Producción diaria por área", value: "DAILY" as ReportType },
    { label: "Por orden de producción", value: "ORDER" as ReportType },
  ];
  protected readonly reportType = signal<ReportType>("DAILY");
  protected readonly areas = signal<ProductionReportArea[]>([]);
  protected readonly orderOptions = signal<ProductionOrderReportOption[]>([]);
  protected readonly orderSelectOptions = computed(() =>
    this.orderOptions().map((order) => ({
      label: `OP-${order.code} · ${this.statusLabel(order.status)} · ${this.shortDate(order.deliveryDate)}`,
      value: order.id,
    })),
  );
  protected readonly dailyReport = signal<DailyProductionReport | null>(null);
  protected readonly orderReport = signal<ProductionOrderReport | null>(null);
  protected readonly reportDate = signal(this.today());
  protected readonly areaIds = signal<string[]>([]);
  protected readonly orderId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal<"PDF" | "XLSX" | null>(null);

  ngOnInit(): void {
    this.loadAreas();
    this.loadOrderOptions();
    this.loadReport();
  }

  protected changeReportType(value: ReportType): void {
    this.reportType.set(value);
    if (value === "ORDER" && !this.orderId() && this.orderOptions().length) {
      this.orderId.set(this.orderOptions()[0].id);
    }
    this.loadReport();
  }

  protected loadReport(): void {
    if (this.reportType() === "ORDER") this.loadOrderReport();
    else this.loadDailyReport();
  }

  protected exportReport(format: "PDF" | "XLSX"): void {
    const params =
      this.reportType() === "ORDER" ? this.orderParams() : this.dailyParams();
    if (!params) return;
    this.exporting.set(format);
    const path = this.reportType() === "ORDER" ? "order" : "daily";
    this.http
      .get(`/api/production-reports/${path}/export`, {
        params: params.set("format", format),
        responseType: "blob",
      })
      .subscribe({
        next: (blob) => {
          this.exporting.set(null);
          this.download(blob, this.filename(format));
        },
        error: (error) => this.fail(error),
      });
  }

  protected number(value: string | number): string {
    return new Intl.NumberFormat("es-BO", { maximumFractionDigits: 6 }).format(
      Number(value),
    );
  }

  protected time(value: string): string {
    return new Intl.DateTimeFormat("es-BO", {
      timeZone: "America/La_Paz",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  protected reportDateLabel(): string {
    return new Intl.DateTimeFormat("es-BO", { dateStyle: "long" }).format(
      new Date(`${this.reportDate()}T12:00:00`),
    );
  }

  protected shortDate(value: string): string {
    return new Intl.DateTimeFormat("es-BO").format(
      new Date(`${value.slice(0, 10)}T12:00:00`),
    );
  }

  protected statusLabel(status: string): string {
    return (
      {
        BORRADOR: "Borrador",
        EMITIDA: "Emitida",
        EN_PROCESO: "En proceso",
        CERRADA: "Completada",
        CERRADA_INCOMPLETA: "Completada con faltantes",
        CANCELADA: "Cancelada",
      }[status] ?? status
    );
  }

  protected stageLabel(stage: string): string {
    return (
      {
        PENDIENTE: "Pendiente",
        EN_PROCESO: "En proceso",
        PENDIENTE_RECEPCION: "Pendiente recepción",
        RECIBIDO_PARCIAL: "Recibido parcial",
        COMPLETADO: "Completado",
        CERRADO_CON_INCIDENCIA: "Completado con incidencia",
        CANCELADO: "Cancelado",
      }[stage] ?? stage
    );
  }

  private loadDailyReport(): void {
    if (!this.reportDate()) return;
    this.loading.set(true);
    this.http
      .get<DailyProductionReport>("/api/production-reports/daily", {
        params: this.dailyParams(),
      })
      .subscribe({
        next: (report) => {
          this.dailyReport.set(report);
          this.loading.set(false);
        },
        error: (error) => this.fail(error),
      });
  }

  private loadOrderReport(): void {
    const params = this.orderParams();
    if (!params) return;
    this.loading.set(true);
    this.http
      .get<ProductionOrderReport>("/api/production-reports/order", { params })
      .subscribe({
        next: (report) => {
          this.orderReport.set(report);
          this.loading.set(false);
        },
        error: (error) => this.fail(error),
      });
  }

  private loadAreas(): void {
    this.http
      .get<ProductionReportArea[]>("/api/production-reports/areas")
      .subscribe({
        next: (areas) => this.areas.set(areas),
        error: (error) => this.fail(error),
      });
  }

  private loadOrderOptions(): void {
    this.http
      .get<ProductionOrderReportOption[]>("/api/production-reports/orders")
      .subscribe({
        next: (orders) => {
          this.orderOptions.set(orders);
          if (!this.orderId() && orders.length) this.orderId.set(orders[0].id);
          if (this.reportType() === "ORDER") this.loadOrderReport();
        },
        error: (error) => this.fail(error),
      });
  }

  private dailyParams(): HttpParams {
    let params = new HttpParams().set("date", this.reportDate());
    if (this.areaIds().length)
      params = params.set("productionAreaIds", this.areaIds().join(","));
    return params;
  }

  private orderParams(): HttpParams | null {
    return this.orderId()
      ? new HttpParams().set("orderId", this.orderId()!)
      : null;
  }

  private filename(format: "PDF" | "XLSX"): string {
    const extension = format === "PDF" ? "pdf" : "xlsx";
    if (this.reportType() === "ORDER") {
      return `icar-produccion-op-${this.orderReport()?.order.code ?? "orden"}.${extension}`;
    }
    return `icar-produccion-diaria-${this.reportDate()}.${extension}`;
  }

  private today(): string {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/La_Paz",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private fail(error: HttpErrorResponse): void {
    this.loading.set(false);
    this.exporting.set(null);
    const detail =
      typeof error.error?.message === "string"
        ? error.error.message
        : "No se pudo generar el reporte";
    this.messages.add({
      severity: "error",
      summary: "Reporte de Producción",
      detail,
    });
  }
}
