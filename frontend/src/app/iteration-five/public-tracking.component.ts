import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TrackingSnapshot, PublicTrackingStatus } from '../core/models';

@Component({
  selector: 'app-public-tracking',
  standalone: true,
  imports: [ButtonModule],
  template: `
    <main class="tracking-page">
      <header><img src="/assets/icar-logo.jpg" alt="ICAR Sabor y Calidad" /><div><span>Seguimiento protegido</span><strong>ICAR Sistema Comercial</strong></div></header>
      <section class="tracking-card">
        @if (loading()) {
          <div class="state-message"><i class="pi pi-spin pi-spinner"></i><h1>Consultando tu pedido…</h1><p>Estamos recuperando la última actualización disponible.</p></div>
        } @else if (error()) {
          <div class="state-message error"><i class="pi pi-link"></i><h1>Seguimiento no disponible</h1><p>{{ error() }}</p><p-button label="Intentar nuevamente" icon="pi pi-refresh" [outlined]="true" (onClick)="load()" /></div>
        } @else if (tracking(); as item) {
          <div class="tracking-head"><div><span class="eyebrow">Pedido</span><h1>{{ item.protectedReference }}</h1></div><span class="status" [attr.data-status]="item.status"><i [class]="statusIcon(item.status)"></i>{{ statusLabel(item.status) }}</span></div>
          <div class="progress"><span [class.done]="step(item.status)>=1"></span><span [class.done]="step(item.status)>=2"></span><span [class.done]="step(item.status)>=3"></span><span [class.done]="step(item.status)>=4"></span></div>
          <div class="summary-grid">
            <article><i class="pi pi-list-check"></i><div><small>Paradas previas pendientes</small><strong>{{ item.status === 'EN_RUTA' ? item.pendingPriorStops : '—' }}</strong></div></article>
            <article><i class="pi pi-clock"></i><div><small>Rango aproximado</small><strong>{{ estimate(item) }}</strong></div></article>
            <article><i class="pi pi-refresh"></i><div><small>Última actualización</small><strong>{{ formatDate(item.lastUpdatedAt) }}</strong></div></article>
          </div>
          <section class="timeline"><h2>Historial</h2>@for (event of item.history; track event.occurredAt) { <div><span></span><article><strong>{{ statusLabel(event.status) }}</strong><small>{{ formatDate(event.occurredAt) }}</small></article></div> } @empty { <p>El seguimiento se actualizará cuando avance la operación.</p> }</section>
          <aside><i class="pi pi-info-circle"></i><p>La hora mostrada es referencial y se calcula con la secuencia de reparto. Esta página no muestra precios, saldos, otros domicilios ni la ubicación exacta del vehículo.</p></aside>
        }
      </section>
      <footer>ICAR · Sabor &amp; Calidad</footer>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;color:#143451;background:radial-gradient(circle at top right,#0c63a8 0,#06457c 28%,#052e57 58%,#041e3a 100%);font-family:Inter,system-ui,sans-serif}.tracking-page{width:min(64rem,100%);min-height:100vh;margin:auto;padding:1.2rem}.tracking-page>header{display:flex;align-items:center;gap:.7rem;color:#fff}.tracking-page>header img{width:3.2rem;height:3.2rem;object-fit:cover;border:2px solid rgb(255 255 255/.5);border-radius:50%}.tracking-page>header span,.tracking-page>header strong{display:block}.tracking-page>header span{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;opacity:.7}.tracking-page>header strong{margin-top:.15rem}.tracking-card{min-height:30rem;margin:clamp(1.4rem,4vw,3rem) 0 1rem;padding:clamp(1.2rem,4vw,2.6rem);border:1px solid rgb(255 255 255/.5);border-radius:1.5rem;background:#fff;box-shadow:0 25px 60px rgb(0 16 35/.35)}.tracking-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.eyebrow{color:#e42c27;font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.tracking-head h1{margin:.3rem 0;font-size:clamp(1.8rem,5vw,3.2rem);letter-spacing:-.06em}.status{display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border-radius:2rem;background:#eaf3f9;color:#07518b;font-size:.68rem;font-weight:850}.status[data-status=ENTREGADO]{color:#157347;background:#e9f8ef}.status[data-status=ENTREGA_NO_COMPLETADA]{color:#a52128;background:#fff0f0}.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:.35rem;margin:1.3rem 0}.progress span{height:.38rem;border-radius:1rem;background:#dce9f1}.progress span.done{background:linear-gradient(90deg,#0878c7,#04a7dc)}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem}.summary-grid article{display:flex;align-items:center;gap:.8rem;padding:1rem;border:1px solid #dce8ef;border-radius:1rem;background:#f7fafc}.summary-grid i{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:.7rem;color:#fff;background:#07518b}.summary-grid small,.summary-grid strong{display:block}.summary-grid small{color:#6b7e8f;font-size:.6rem}.summary-grid strong{margin-top:.25rem;font-size:.78rem}.timeline{margin-top:1.6rem}.timeline h2{font-size:1rem}.timeline>div{display:grid;grid-template-columns:1.2rem 1fr;gap:.6rem;padding-bottom:.7rem}.timeline>div>span{width:.7rem;height:.7rem;margin-top:.38rem;border:3px solid #cce8f5;border-radius:50%;background:#0784c8}.timeline article{display:flex;justify-content:space-between;gap:1rem;padding:.65rem .8rem;border-radius:.65rem;background:#f3f7fa;font-size:.7rem}.timeline small{color:#6b7e8f}.timeline>p{color:#6b7e8f;font-size:.72rem}.tracking-card aside{display:flex;gap:.65rem;margin-top:1.3rem;padding:.8rem;border-radius:.7rem;color:#496376;background:#edf7fc}.tracking-card aside p{margin:0;font-size:.66rem;line-height:1.55}.state-message{min-height:25rem;display:grid;place-items:center;align-content:center;text-align:center}.state-message>i{font-size:2.5rem;color:#0878c7}.state-message h1{margin:.8rem 0 .2rem}.state-message p{max-width:28rem;color:#6b7e8f;font-size:.75rem}.tracking-page>footer{text-align:center;color:rgb(255 255 255/.65);font-size:.62rem}@media(max-width:700px){.tracking-head{align-items:flex-start;flex-direction:column}.summary-grid{grid-template-columns:1fr}.timeline article{display:grid}.tracking-card{border-radius:1rem}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicTrackingComponent implements OnInit {
  private readonly http = inject(HttpClient);
  readonly token = input.required<string>();
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly tracking = signal<TrackingSnapshot | null>(null);

  ngOnInit(): void { this.load(); }

  protected load(): void {
    this.loading.set(true); this.error.set('');
    this.http.get<TrackingSnapshot>(`/api/public/tracking/${encodeURIComponent(this.token())}`).subscribe({
      next: (item) => { this.tracking.set(item); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.tracking.set(null); this.loading.set(false); this.error.set(error.status === 429 ? 'Se realizaron demasiadas consultas. Espera un momento antes de reintentar.' : 'El enlace es inválido, expiró o fue revocado.'); },
    });
  }

  protected statusLabel(value: PublicTrackingStatus): string { return ({ PEDIDO_CONFIRMADO:'Pedido confirmado', EN_PREPARACION:'En preparación', PREPARADO:'Preparado', EN_RUTA:'En ruta', ENTREGADO:'Entregado', ENTREGA_NO_COMPLETADA:'Entrega no completada' })[value]; }
  protected statusIcon(value: PublicTrackingStatus): string { return value === 'ENTREGADO' ? 'pi pi-check-circle' : value === 'ENTREGA_NO_COMPLETADA' ? 'pi pi-exclamation-circle' : value === 'EN_RUTA' ? 'pi pi-truck' : 'pi pi-box'; }
  protected step(value: PublicTrackingStatus): number { return ({ PEDIDO_CONFIRMADO:1, EN_PREPARACION:2, PREPARADO:3, EN_RUTA:4, ENTREGADO:4, ENTREGA_NO_COMPLETADA:4 })[value]; }
  protected formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  protected estimate(item: TrackingSnapshot): string { return item.estimatedFrom && item.estimatedUntil ? `${new Intl.DateTimeFormat('es-BO',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.estimatedFrom))} – ${new Intl.DateTimeFormat('es-BO',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.estimatedUntil))}` : 'Disponible al iniciar la ruta'; }
}
