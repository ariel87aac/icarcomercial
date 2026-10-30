import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { PublicOrderConfirmation } from '../core/models';

@Component({
  selector: 'app-public-order-confirmation',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <main class="confirmation-page">
      <header><img src="/assets/icar-logo.jpg" alt="ICAR Sabor y Calidad" /><div><span>Confirmación protegida</span><strong>ICAR Sistema Comercial</strong></div></header>
      <section class="confirmation-card">
        @if (loading()) {
          <div class="state"><i class="pi pi-spin pi-spinner"></i><h1>Consultando tu pedido…</h1><p>Estamos validando el enlace y el plazo de confirmación.</p></div>
        } @else if (error()) {
          <div class="state error"><i class="pi pi-link"></i><h1>Confirmación no disponible</h1><p>{{ error() }}</p><p-button label="Intentar nuevamente" icon="pi pi-refresh" [outlined]="true" (onClick)="load()" /></div>
        } @else if (order(); as item) {
          <div class="heading"><div><span class="eyebrow">Pedido N°</span><h1>{{ item.orderReference }}</h1><p>{{ item.customerName }}</p></div><span class="status" [class.confirmed]="item.status==='CONFIRMADO'"><i [class]="item.status==='CONFIRMADO' ? 'pi pi-check-circle' : 'pi pi-file-edit'"></i>{{ statusLabel(item.status) }}</span></div>
          <div class="summary"><article><small>Fecha de entrega</small><strong>{{ formatDate(item.requestedDate, false) }}</strong></article><article><small>Confirmar hasta</small><strong>{{ formatDate(item.orderCutoffAt, true) }}</strong></article><article><small>Total</small><strong>Bs {{ item.total }}</strong></article></div>
          <section class="details"><h2>Productos del pedido</h2>@for (detail of item.details; track detail.product + detail.presentation) { <article><div><strong>{{ detail.product }}</strong><small>{{ detail.presentation }} · {{ detail.unit }}</small></div><span>{{ number(detail.quantity) }}</span><b>Bs {{ detail.subtotal }}</b></article> }</section>
          @if (item.trackingUrl) { <p><a [href]="item.trackingUrl">Ver seguimiento o solicitar cambios en los productos</a></p> }
          @if (item.canConfirm) {
            <aside><i class="pi pi-info-circle"></i><p>Al confirmar, ICAR validará nuevamente los precios, la fecha y la disponibilidad. El pedido quedará listo para continuar a Producción, Preparación y Distribución.</p></aside>
            <p-button label="Confirmar mi pedido" icon="pi pi-check-circle" severity="success" [loading]="confirming()" styleClass="confirm-button" (onClick)="confirm()" />
          } @else if (item.status==='CONFIRMADO') {
            <div class="confirmed-message"><i class="pi pi-check-circle"></i><div><strong>Pedido confirmado</strong><span>Tu confirmación fue registrada correctamente. Recibirás el detalle también por WhatsApp.</span></div></div>
          }
        }
      </section>
      <footer>ICAR · Sabor &amp; Calidad</footer>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;color:#143451;background:radial-gradient(circle at top right,#0c63a8 0,#06457c 28%,#052e57 58%,#041e3a 100%);font-family:Inter,system-ui,sans-serif}.confirmation-page{width:min(58rem,100%);min-height:100vh;margin:auto;padding:1.2rem}.confirmation-page>header{display:flex;align-items:center;gap:.7rem;color:#fff}.confirmation-page>header img{width:3.2rem;height:3.2rem;object-fit:cover;border:2px solid rgb(255 255 255/.5);border-radius:50%}.confirmation-page>header span,.confirmation-page>header strong{display:block}.confirmation-page>header span{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;opacity:.72}.confirmation-card{min-height:30rem;margin:clamp(1.4rem,4vw,3rem) 0 1rem;padding:clamp(1.2rem,4vw,2.6rem);border:1px solid rgb(255 255 255/.5);border-radius:1.5rem;background:#fff;box-shadow:0 25px 60px rgb(0 16 35/.35)}.heading{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.eyebrow{color:#e42c27;font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.heading h1{margin:.2rem 0;font-size:clamp(2rem,6vw,3.4rem);letter-spacing:-.06em}.heading p{margin:0;color:#6b7e8f}.status{display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border-radius:2rem;color:#07518b;background:#eaf3f9;font-size:.68rem;font-weight:850}.status.confirmed{color:#157347;background:#e9f8ef}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin:1.4rem 0}.summary article{padding:1rem;border:1px solid #dce8ef;border-radius:.9rem;background:#f7fafc}.summary small,.summary strong{display:block}.summary small{color:#6b7e8f;font-size:.62rem}.summary strong{margin-top:.3rem;font-size:.8rem}.details{overflow:hidden;border:1px solid #dce8ef;border-radius:1rem}.details h2{margin:0;padding:1rem;background:#f3f7fa;font-size:.9rem}.details article{display:grid;grid-template-columns:1fr auto 6rem;align-items:center;gap:1rem;padding:.8rem 1rem;border-top:1px solid #e7eef3;font-size:.72rem}.details small{display:block;margin-top:.2rem;color:#6b7e8f;font-size:.62rem}.details article>span{min-width:3rem;text-align:center}.details article>b{text-align:right}.confirmation-card aside{display:flex;gap:.65rem;margin-top:1rem;padding:.85rem;border-radius:.7rem;color:#496376;background:#edf7fc}.confirmation-card aside p{margin:0;font-size:.68rem;line-height:1.55}:host ::ng-deep .confirm-button{width:100%;margin-top:1rem;justify-content:center}.confirmed-message{display:flex;align-items:center;gap:.8rem;margin-top:1rem;padding:1rem;border:1px solid #b7e4c7;border-radius:.8rem;color:#166534;background:#f0fdf4}.confirmed-message>i{font-size:1.5rem}.confirmed-message strong,.confirmed-message span{display:block}.confirmed-message span{margin-top:.2rem;font-size:.66rem}.state{min-height:25rem;display:grid;place-items:center;align-content:center;text-align:center}.state>i{font-size:2.5rem;color:#0878c7}.state h1{margin:.8rem 0 .2rem}.state p{max-width:28rem;color:#6b7e8f;font-size:.75rem}.confirmation-page>footer{text-align:center;color:rgb(255 255 255/.65);font-size:.62rem}@media(max-width:650px){.heading{flex-direction:column}.summary{grid-template-columns:1fr}.details article{grid-template-columns:1fr auto}.details article>b{grid-column:1/-1;text-align:left}.confirmation-card{border-radius:1rem}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicOrderConfirmationComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly token = input.required<string>();
  protected readonly loading = signal(true);
  protected readonly confirming = signal(false);
  protected readonly error = signal('');
  protected readonly order = signal<PublicOrderConfirmation | null>(null);

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.http.get<PublicOrderConfirmation>(`/api/public/order-confirmations/${encodeURIComponent(this.token())}`).subscribe({
      next: (item) => { this.order.set(item); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.order.set(null); this.loading.set(false); this.error.set(this.errorMessage(error)); },
    });
  }

  protected confirm(): void {
    if (!this.order()?.canConfirm) return;
    this.confirming.set(true); this.error.set('');
    this.http.post<PublicOrderConfirmation>(`/api/public/order-confirmations/${encodeURIComponent(this.token())}/confirm`, {}).subscribe({
      next: (item) => { this.order.set(item); this.confirming.set(false); },
      error: (error: HttpErrorResponse) => { this.confirming.set(false); this.error.set(this.errorMessage(error)); this.order.set(null); },
    });
  }

  protected statusLabel(value: string): string { return value === 'CONFIRMADO' ? 'Confirmado' : value === 'RECIBIDO' ? 'Recibido' : 'Borrador'; }
  protected number(value: string): number { return Number(value); }
  protected formatDate(value: string, withTime: boolean): string { return new Intl.DateTimeFormat('es-BO', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value)); }
  private errorMessage(error: HttpErrorResponse): string { return typeof error.error?.message === 'string' ? error.error.message : 'El enlace es inválido, expiró o ya fue revocado.'; }
}
