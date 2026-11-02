import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InventoryKardexProductOption, InventoryKardexReport } from '../../../../../compartido/modelos';

@Component({
  selector: 'app-inventory-kardex',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './inventory-kardex.component.html',
  styleUrl: './inventory-kardex.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryKardexComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  protected readonly products = signal<InventoryKardexProductOption[]>([]);
  protected readonly presentationId = signal<string | null>(null);
  protected readonly from = signal(this.monthStart());
  protected readonly to = signal(this.today());
  protected readonly report = signal<InventoryKardexReport | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal<'PDF' | 'XLSX' | null>(null);

  ngOnInit(): void {
    this.http.get<InventoryKardexProductOption[]>('/api/inventario/kardex/options').subscribe({
      next: (products) => this.products.set(products),
      error: (error) => this.fail(error),
    });
  }

  protected load(): void {
    if (!this.validFilters()) return;
    this.loading.set(true);
    this.http.get<InventoryKardexReport>('/api/inventario/kardex', { params: this.params() }).subscribe({
      next: (report) => { this.report.set(report); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  protected export(format: 'PDF' | 'XLSX'): void {
    if (!this.validFilters()) return;
    this.exporting.set(format);
    this.http.get('/api/inventario/kardex/export', {
      params: this.params().set('format', format), responseType: 'blob',
    }).subscribe({
      next: (blob) => {
        const report = this.report();
        const code = report?.product.productCode ?? 'producto';
        this.exporting.set(null);
        this.download(blob, `icar-kardex-${code}-${this.from()}-${this.to()}.${format === 'PDF' ? 'pdf' : 'xlsx'}`);
      },
      error: (error) => this.fail(error),
    });
  }

  protected number(value: number): string {
    return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 6 }).format(value);
  }

  protected dateTime(value: string): string {
    return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  private params(): HttpParams {
    return new HttpParams().set('presentationId', this.presentationId() ?? '').set('from', this.from()).set('to', this.to());
  }

  private validFilters(): boolean {
    if (!this.presentationId()) {
      this.messages.add({ severity: 'warn', summary: 'Kardex', detail: 'Seleccione un producto y su presentación.' });
      return false;
    }
    if (!this.from() || !this.to() || this.from() > this.to()) {
      this.messages.add({ severity: 'warn', summary: 'Kardex', detail: 'Revise el rango de fechas: Desde no puede ser posterior a Hasta.' });
      return false;
    }
    return true;
  }

  private today(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date());
  }

  private monthStart(): string { return `${this.today().slice(0, 7)}-01`; }

  private download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
  }

  private fail(error: HttpErrorResponse): void {
    this.loading.set(false); this.exporting.set(null);
    const message = error.error?.message;
    this.messages.add({ severity: 'error', summary: 'Kardex de Almacén', detail: Array.isArray(message) ? message.join('. ') : message || 'No se pudo consultar el Kardex.' });
  }
}
