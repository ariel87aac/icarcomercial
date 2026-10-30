import { FormsModule } from '@angular/forms';
import { workflowLabel } from '../../../../pedidos/dominio/order-workflow';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, DestroyRef, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TrackingSnapshot, PublicTrackingStatus } from '../../../../../compartido/modelos';

@Component({
  selector: 'app-public-tracking',
  standalone: true,
  imports: [ButtonModule, FormsModule],
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
            <article><i class="pi pi-list-check"></i><div><small>Tu turno de entrega</small><strong>{{ item.deliveryTurn === 1 ? 'Tu pedido es la próxima entrega' : item.deliveryTurn ? 'Tu pedido es la entrega número '+item.deliveryTurn : '—' }}</strong>@if (item.deliveryTurn && item.deliveryTurn>1) { <small>Tienes {{ item.pendingPriorStops }} pedido(s) antes del tuyo</small> }</div></article>
            <article><i class="pi pi-clock"></i><div><small>Rango aproximado</small><strong>{{ estimate(item) }}</strong></div></article>
            <article><i class="pi pi-refresh"></i><div><small>Última actualización</small><strong>{{ formatDate(item.lastUpdatedAt) }}</strong></div></article>
          </div>
          <section class="timeline"><h2>Historial</h2>@for (event of item.history; track $index) { <div><span></span><article><strong>{{ statusLabel(event.status) }}</strong><small>{{ formatDate(event.occurredAt) }}</small></article></div> } @empty { <p>El seguimiento se actualizará cuando avance la operación.</p> }</section>
          @if (item.status!=='CANCELADO') {
            <section class="request-form"><h2>Solicitar modificación o cambio de productos</h2><p>Describe qué necesitas revisar. Nuestro equipo atenderá la solicitud y te indicará cómo continuar.</p><label for="request-message">Detalle de tu solicitud</label><textarea id="request-message" rows="4" maxlength="1000" [ngModel]="requestMessage()" (ngModelChange)="requestMessage.set($event)"></textarea><p-button label="Enviar solicitud" icon="pi pi-comments" [loading]="requestSaving()" [disabled]="requestMessage().trim().length<5" (onClick)="sendRequest()" />@if (requestResult()) { <p role="status">{{ requestResult() }}</p> }</section>
          }
          @for (request of item.changeRequests; track request.id) { <section class="request-form"><strong>Solicitud {{ request.status==='PENDIENTE' ? 'pendiente de atención' : 'resuelta' }}</strong><p>{{ request.message }}</p>@if (request.response) { <p>Respuesta: {{ request.response }}</p> }</section> }
          <aside><i class="pi pi-info-circle"></i><p>La hora mostrada es referencial y se calcula con la secuencia de reparto. Esta página no muestra precios, saldos, otros domicilios ni la ubicación exacta del vehículo.</p></aside>
        }
      </section>
      <footer>ICAR · Sabor &amp; Calidad</footer>
    </main>
  `,
  styles: [`
    .request-form{margin-top:1.2rem;padding:1rem;border:1px solid #dce8ef;border-radius:1rem}.request-form h2{font-size:1rem}.request-form p,.request-form label{font-size:.8rem}.request-form textarea{display:block;width:100%;margin:.5rem 0 1rem;padding:.7rem;border:1px solid #aac4d4;border-radius:.5rem;font:inherit}
    :host{display:block;min-height:100vh;color:#143451;background:radial-gradient(circle at top right,#0c63a8 0,#06457c 28%,#052e57 58%,#041e3a 100%);font-family:Inter,system-ui,sans-serif}.tracking-page{width:min(64rem,100%);min-height:100vh;margin:auto;padding:1.2rem}.tracking-page>header{display:flex;align-items:center;gap:.7rem;color:#fff}.tracking-page>header img{width:3.2rem;height:3.2rem;object-fit:cover;border:2px solid rgb(255 255 255/.5);border-radius:50%}.tracking-page>header span,.tracking-page>header strong{display:block}.tracking-page>header span{font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;opacity:.7}.tracking-page>header strong{margin-top:.15rem}.tracking-card{min-height:30rem;margin:clamp(1.4rem,4vw,3rem) 0 1rem;padding:clamp(1.2rem,4vw,2.6rem);border:1px solid rgb(255 255 255/.5);border-radius:1.5rem;background:#fff;box-shadow:0 25px 60px rgb(0 16 35/.35)}.tracking-head{display:flex;align-items:flex-start;justify-content:space-between;gap:1rem}.eyebrow{color:#e42c27;font-size:.65rem;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.tracking-head h1{margin:.3rem 0;font-size:clamp(1.8rem,5vw,3.2rem);letter-spacing:-.06em}.status{display:flex;align-items:center;gap:.45rem;padding:.65rem .9rem;border-radius:2rem;background:#eaf3f9;color:#07518b;font-size:.68rem;font-weight:850}.status[data-status=ENTREGADO]{color:#157347;background:#e9f8ef}.status[data-status=ENTREGA_NO_COMPLETADA]{color:#a52128;background:#fff0f0}.progress{display:grid;grid-template-columns:repeat(4,1fr);gap:.35rem;margin:1.3rem 0}.progress span{height:.38rem;border-radius:1rem;background:#dce9f1}.progress span.done{background:linear-gradient(90deg,#0878c7,#04a7dc)}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem}.summary-grid article{display:flex;align-items:center;gap:.8rem;padding:1rem;border:1px solid #dce8ef;border-radius:1rem;background:#f7fafc}.summary-grid i{display:grid;place-items:center;width:2.2rem;height:2.2rem;border-radius:.7rem;color:#fff;background:#07518b}.summary-grid small,.summary-grid strong{display:block}.summary-grid small{color:#6b7e8f;font-size:.6rem}.summary-grid strong{margin-top:.25rem;font-size:.78rem}.timeline{margin-top:1.6rem}.timeline h2{font-size:1rem}.timeline>div{display:grid;grid-template-columns:1.2rem 1fr;gap:.6rem;padding-bottom:.7rem}.timeline>div>span{width:.7rem;height:.7rem;margin-top:.38rem;border:3px solid #cce8f5;border-radius:50%;background:#0784c8}.timeline article{display:flex;justify-content:space-between;gap:1rem;padding:.65rem .8rem;border-radius:.65rem;background:#f3f7fa;font-size:.7rem}.timeline small{color:#6b7e8f}.timeline>p{color:#6b7e8f;font-size:.72rem}.tracking-card aside{display:flex;gap:.65rem;margin-top:1.3rem;padding:.8rem;border-radius:.7rem;color:#496376;background:#edf7fc}.tracking-card aside p{margin:0;font-size:.66rem;line-height:1.55}.state-message{min-height:25rem;display:grid;place-items:center;align-content:center;text-align:center}.state-message>i{font-size:2.5rem;color:#0878c7}.state-message h1{margin:.8rem 0 .2rem}.state-message p{max-width:28rem;color:#6b7e8f;font-size:.75rem}.tracking-page>footer{text-align:center;color:rgb(255 255 255/.65);font-size:.62rem}@media(max-width:700px){.tracking-head{align-items:flex-start;flex-direction:column}.summary-grid{grid-template-columns:1fr}.timeline article{display:grid}.tracking-card{border-radius:1rem}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicTrackingComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  readonly token = input.required<string>();
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly tracking = signal<TrackingSnapshot | null>(null);

  private readonly destroyRef=inject(DestroyRef);
  private timer:ReturnType<typeof setInterval>|undefined;
  private refreshing=false;
  protected readonly requestMessage=signal('');
  protected readonly requestResult=signal('');
  protected readonly requestSaving=signal(false);
  ngOnInit(): void { this.load(); this.timer=setInterval(()=>this.load(false),10000); }
  ngOnDestroy():void{if(this.timer)clearInterval(this.timer);}

  protected sendRequest():void{
    this.requestSaving.set(true);this.requestResult.set('');
    this.http.post(`/api/public/tracking/${encodeURIComponent(this.token())}/change-requests`,{message:this.requestMessage().trim()}).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({next:()=>{this.requestSaving.set(false);this.requestMessage.set('');this.requestResult.set('Tu solicitud fue registrada. Nuestro equipo la revisará.');this.load(false)},error:()=>{this.requestSaving.set(false);this.requestResult.set('No se pudo registrar la solicitud. Intenta nuevamente.')}});
  }

  protected load(showLoading=true): void {
    if(this.refreshing)return;this.refreshing=true;
    if(showLoading)this.loading.set(true); this.error.set('');
    this.http.get<TrackingSnapshot>(`/api/public/tracking/${encodeURIComponent(this.token())}`).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (item) => { this.refreshing=false;this.tracking.set(item); this.loading.set(false); },
      error: (error: HttpErrorResponse) => { this.refreshing=false;if(!showLoading && error.status!==404 && error.status!==410)return;this.tracking.set(null); this.loading.set(false); this.error.set(error.status === 429 ? 'Se realizaron demasiadas consultas. Espera un momento antes de reintentar.' : 'El enlace es inválido, expiró o fue revocado.'); },
    });
  }

  protected statusLabel(value: PublicTrackingStatus): string { return workflowLabel(value); }
  protected statusIcon(value: PublicTrackingStatus): string { return value === 'ENTREGADO' ? 'pi pi-check-circle' : value === 'ENTREGA_NO_COMPLETADA' ? 'pi pi-exclamation-circle' : value === 'EN_RUTA' ? 'pi pi-truck' : 'pi pi-box'; }
  protected step(value: PublicTrackingStatus): number { if(['BORRADOR','RECIBIDO','CANCELADO'].includes(value))return 0;if(value==='PEDIDO_CONFIRMADO')return 1;if(['EN_PREPARACION','DISPONIBLE_PARA_PREPARAR'].includes(value))return 2;if(['PREPARADO','ASIGNADO'].includes(value))return 3;return 4; }
  protected formatDate(value: string): string { return new Intl.DateTimeFormat('es-BO',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)); }
  protected estimate(item: TrackingSnapshot): string { if(['ENTREGADO','ENTREGA_PARCIAL','ENTREGA_NO_COMPLETADA'].includes(item.status))return 'Visita registrada';if(item.status==='CANCELADO')return 'Pedido cancelado';return item.estimatedFrom && item.estimatedUntil ? `${new Intl.DateTimeFormat('es-BO',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.estimatedFrom))} – ${new Intl.DateTimeFormat('es-BO',{hour:'2-digit',minute:'2-digit'}).format(new Date(item.estimatedUntil))}` : item.status==='EN_RUTA' ? 'Horario no estimado' : 'Disponible al iniciar el reparto'; }
}
