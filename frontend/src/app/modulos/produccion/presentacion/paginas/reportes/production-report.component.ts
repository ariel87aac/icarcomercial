import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { DailyProductionReport, ProductionReportArea } from '../../../../../compartido/modelos';

@Component({
  selector: 'app-production-report',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MultiSelectModule],
  templateUrl: './production-report.component.html',
  styleUrl: './production-report.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionReportComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  protected readonly areas = signal<ProductionReportArea[]>([]);
  protected readonly report = signal<DailyProductionReport | null>(null);
  protected readonly reportDate = signal(this.today());
  protected readonly areaIds = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly exporting = signal<'PDF' | 'XLSX' | null>(null);

  ngOnInit(): void {
    this.loadAreas();
    this.loadReport();
  }

  protected loadReport(): void {
    if (!this.reportDate()) return;
    this.loading.set(true);
    this.http.get<DailyProductionReport>('/api/production-reports/daily', { params: this.params() }).subscribe({
      next: (report) => { this.report.set(report); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  protected exportReport(format: 'PDF' | 'XLSX'): void {
    if (!this.reportDate()) return;
    this.exporting.set(format);
    const params = this.params().set('format', format);
    this.http.get('/api/production-reports/daily/export', { params, responseType: 'blob' }).subscribe({
      next: (blob) => {
        this.exporting.set(null);
        this.download(blob, `icar-produccion-diaria-${this.reportDate()}.${format === 'PDF' ? 'pdf' : 'xlsx'}`);
      },
      error: (error) => this.fail(error),
    });
  }

  protected number(value: string | number): string {
    return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 6 }).format(Number(value));
  }

  protected time(value: string): string {
    return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  }

  protected reportDateLabel(): string {
    return new Intl.DateTimeFormat('es-BO', { dateStyle: 'long' }).format(new Date(`${this.reportDate()}T12:00:00`));
  }

  private loadAreas(): void {
    this.http.get<ProductionReportArea[]>('/api/production-reports/areas').subscribe({
      next: (areas) => this.areas.set(areas),
      error: (error) => this.fail(error),
    });
  }

  private params(): HttpParams {
    let params = new HttpParams().set('date', this.reportDate());
    if (this.areaIds().length) params = params.set('productionAreaIds', this.areaIds().join(','));
    return params;
  }

  private today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private fail(error: HttpErrorResponse): void {
    this.loading.set(false);
    this.exporting.set(null);
    const detail = typeof error.error?.message === 'string' ? error.error.message : 'No se pudo generar el reporte';
    this.messages.add({ severity: 'error', summary: 'Reporte de Producción', detail });
  }
}
