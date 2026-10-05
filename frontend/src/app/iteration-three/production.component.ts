import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../core/auth.service';
import {
  CommercialCatalogProduct,
  Paginated,
  ProductLine,
  ProductionConsolidation,
  ProductionConsolidationDetail,
  ProductionConsolidationSource,
  ProductionConsolidationStatus,
  ProductionHistory,
  ProductionSummaryRow,
} from '../core/models';

@Component({
  selector: 'app-production',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  template: `
    <div class="page-toolbar">
      <div><span class="eyebrow">Tercera iteración</span><h2>Consolidación para Producción</h2><p>Requerimientos versionados desde pedidos Confirmados, avances y diferencias trazables.</p></div>
      @if (auth.can('production.consolidations.create')) { <p-button label="Generar consolidación" icon="pi pi-plus" (onClick)="openGeneration(false)" /> }
    </div>

    <div class="view-tabs">
      <button type="button" [class.active]="view()==='consolidations'" (click)="setView('consolidations')"><i class="pi pi-list"></i> Consolidaciones</button>
      @if (auth.can('production.summary.read')) { <button type="button" [class.active]="view()==='summary'" (click)="setView('summary')"><i class="pi pi-chart-bar"></i> Resumen</button> }
    </div>

    <div class="filters">
      <label><span>Fecha de entrega</span><input pInputText type="date" [value]="dateFilter()" (input)="dateFilter.set($any($event.target).value)" /></label>
      <label><span>Línea productiva</span><p-select [options]="lines()" optionLabel="name" optionValue="id" [ngModel]="lineFilter()" (ngModelChange)="lineFilter.set($event)" placeholder="Todas las líneas" [showClear]="true" /></label>
      @if (view()==='consolidations') { <label><span>Estado</span><p-select [options]="statusOptions" [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" placeholder="Todos los estados" [showClear]="true" /></label> }
      <p-button label="Aplicar" icon="pi pi-filter" [outlined]="true" (onClick)="reload()" />
    </div>

    @if (view()==='consolidations') {
      <div class="table-card"><p-table [value]="consolidations()" [loading]="loading()" [scrollable]="true">
        <ng-template #header><tr><th>Entrega / versión</th><th>Tipo</th><th>Estado</th><th>Generación</th><th>Emisión / cierre</th><th>Acciones</th></tr></ng-template>
        <ng-template #body let-item><tr>
          <td><div class="stack"><strong>{{ formatDate(item.deliveryDate, false) }}</strong><small>Versión {{ item.version }} · {{ item.detailCount || 0 }} productos</small></div></td>
          <td><span class="type-badge">{{ item.type }}</span></td>
          <td><p-tag [severity]="severity(item.status)" [value]="statusLabel(item.status)" /></td>
          <td><div class="stack"><strong>{{ item.generatedBy.name }}</strong><small>{{ formatDate(item.createdAt, true) }}</small></div></td>
          <td><div class="stack"><strong>{{ item.closedBy?.name || item.emittedBy?.name || 'Pendiente' }}</strong><small>{{ formatDate(item.closedAt || item.emittedAt, true) }}</small></div></td>
          <td><div class="actions"><p-button icon="pi pi-eye" [text]="true" [rounded]="true" title="Consultar detalle" (onClick)="openDetail(item)" />@if (auth.can('production.history.read')) { <p-button icon="pi pi-history" [text]="true" [rounded]="true" severity="secondary" title="Historial" (onClick)="openHistory(item)" /> }</div></td>
        </tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="6"><div class="empty"><i class="pi pi-box"></i><strong>No existen consolidaciones con estos filtros</strong><span>La generación utiliza únicamente detalles de pedidos Confirmados.</span></div></td></tr></ng-template>
      </p-table></div>
    } @else {
      <div class="metrics"><article><span>Solicitado</span><strong>{{ total('requestedQuantity') }}</strong></article><article><span>Preparado</span><strong>{{ total('preparedQuantity') }}</strong></article><article><span>Pendiente</span><strong>{{ total('pendingQuantity') }}</strong></article><article><span>Diferencia</span><strong [class.negative]="totalNumber('difference')<0" [class.positive]="totalNumber('difference')>0">{{ total('difference') }}</strong></article></div>
      <div class="table-card"><p-table [value]="summary()" [loading]="loading()" [scrollable]="true">
        <ng-template #header><tr><th>Fecha / versión</th><th>Línea</th><th>Producto</th><th>Unidad</th><th>Solicitado</th><th>Preparado</th><th>Pendiente</th><th>Diferencia</th><th>Estado</th></tr></ng-template>
        <ng-template #body let-row><tr><td><div class="stack"><strong>{{ formatDate(row.deliveryDate,false) }}</strong><small>V{{ row.version }} · {{ row.type }}</small></div></td><td>{{ row.productLineName }}</td><td><strong>{{ row.productName }}</strong></td><td>{{ row.baseUnitAbbreviation }}</td><td>{{ number(row.requestedQuantity) }}</td><td>{{ number(row.preparedQuantity) }}</td><td>{{ number(row.pendingQuantity) }}</td><td><strong [class.negative]="numberValue(row.difference)<0" [class.positive]="numberValue(row.difference)>0">{{ number(row.difference) }}</strong></td><td><p-tag [severity]="severity(row.status)" [value]="statusLabel(row.status)" /></td></tr></ng-template>
        <ng-template #emptymessage><tr><td colspan="9"><div class="empty"><strong>Sin resultados consolidados</strong></div></td></tr></ng-template>
      </p-table></div>
    }

    <p-dialog [visible]="generationDialog()" (visibleChange)="generationDialog.set($event)" [modal]="true" [style]="{width:'min(560px,96vw)'}" [header]="complementaryGeneration() ? 'Generar consolidación complementaria' : 'Generar consolidación principal'" [draggable]="false">
      <form [formGroup]="generationForm" (ngSubmit)="generate()"><p class="intro">Se seleccionarán únicamente detalles Confirmados, de la fecha indicada y todavía no asignados.</p><div class="form-grid"><label><span>Fecha de entrega *</span><input pInputText type="date" formControlName="deliveryDate" /></label><label><span>Línea productiva</span><p-select formControlName="productLineId" [options]="lines()" optionLabel="name" optionValue="id" placeholder="Todas las líneas" [showClear]="true" /></label></div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="generationDialog.set(false)" />@if (!complementaryGeneration()) { <p-button type="button" label="Generar complementaria" [outlined]="true" severity="secondary" (onClick)="complementaryGeneration.set(true)" /> }<p-button type="submit" label="Generar Borrador" icon="pi pi-cog" [loading]="saving()" /></div></form>
    </p-dialog>

    <p-dialog [visible]="detailDialog()" (visibleChange)="detailDialog.set($event)" [modal]="true" [style]="{width:'min(1120px,99vw)'}" [header]="detailTitle()" [draggable]="false">
      @if (selected(); as item) {
        <div class="detail-summary"><div><span>Entrega</span><strong>{{ formatDate(item.deliveryDate,false) }}</strong></div><div><span>Versión</span><strong>{{ item.version }} · {{ item.type }}</strong></div><div><span>Estado</span><p-tag [severity]="severity(item.status)" [value]="statusLabel(item.status)" /></div><div><span>Responsable</span><strong>{{ item.generatedBy.name }}</strong></div></div>
        <div class="detail-table"><table><thead><tr><th>Línea / producto</th><th>Unidad base</th><th>Solicitado</th><th>Preparado</th><th>Pendiente</th><th>Diferencia</th><th>Fuentes</th><th></th></tr></thead><tbody>@for (detail of item.details; track detail.id) { <tr><td><div class="stack"><strong>{{ detail.product.name }}</strong><small>{{ detail.productLine.name }}</small></div></td><td>{{ detail.baseUnit.abbreviation }}</td><td>{{ number(detail.requestedQuantity) }}</td><td>{{ number(detail.preparedQuantity) }}</td><td>{{ pending(detail) }}</td><td><strong [class.negative]="numberValue(detail.difference)<0" [class.positive]="numberValue(detail.difference)>0">{{ number(detail.difference) }}</strong></td><td><button type="button" class="source-link" (click)="openSources(item,detail)">{{ detail.sources.length || 0 }} pedidos</button></td><td>@if (auth.can('production.progress.create') && (item.status==='EMITIDA'||item.status==='EN_PROCESO')) { <p-button label="Avance" icon="pi pi-plus" size="small" [outlined]="true" (onClick)="openProgress(detail)" /> }</td></tr> } @empty { <tr><td colspan="8" class="empty-row">No existen detalles visibles para las líneas autorizadas.</td></tr> }</tbody></table></div>
        <div class="detail-actions">@if (auth.can('production.consolidations.edit') && item.status==='BORRADOR') { <p-button label="Recalcular" icon="pi pi-refresh" [outlined]="true" (onClick)="recalculate(item)" /> }@if (auth.can('production.consolidations.emit') && item.status==='BORRADOR') { <p-button label="Emitir requerimiento" icon="pi pi-send" (onClick)="emit(item)" /> }@if (auth.can('production.close') && (item.status==='EMITIDA'||item.status==='EN_PROCESO')) { <p-button label="Cerrar requerimiento" icon="pi pi-check-circle" severity="success" (onClick)="openClose()" /> }@if (auth.can('production.consolidations.create') && item.status!=='BORRADOR') { <p-button label="Nueva complementaria" icon="pi pi-copy" [outlined]="true" severity="secondary" (onClick)="openGeneration(true,item.deliveryDate)" /> }</div>
      }
    </p-dialog>

    <p-dialog [visible]="sourcesDialog()" (visibleChange)="sourcesDialog.set($event)" [modal]="true" [style]="{width:'min(900px,98vw)'}" header="Pedidos de origen" [draggable]="false"><div class="detail-table"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Presentación</th><th>Cantidad original</th><th>Factor</th><th>Aporte base</th></tr></thead><tbody>@for (source of visibleSources(); track source.id) { <tr><td><strong>{{ source.orderDetail.order.code }}</strong></td><td>{{ source.orderDetail.order.customerNameSnapshot || source.orderDetail.order.customer.businessName }}</td><td>{{ source.presentation.description }}</td><td>{{ number(source.originalQuantity) }}</td><td>{{ number(source.appliedFactor) }}</td><td><strong>{{ number(source.baseContribution) }}</strong></td></tr> } @empty { <tr><td colspan="6" class="empty-row">No existen fuentes visibles.</td></tr> }</tbody></table></div></p-dialog>

    <p-dialog [visible]="progressDialog()" (visibleChange)="progressDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" header="Registrar avance de Producción" [draggable]="false"><form [formGroup]="progressForm" (ngSubmit)="registerProgress()">@if (selectedDetail(); as detail) { <p class="intro"><strong>{{ detail.product.name }}</strong> · solicitado {{ number(detail.requestedQuantity) }} {{ detail.baseUnit.abbreviation }}, preparado {{ number(detail.preparedQuantity) }}.</p> }<div class="form-grid"><label><span>Cantidad preparada *</span><p-inputnumber formControlName="quantity" [min]="0.000001" [maxFractionDigits]="6" /></label><label class="wide"><span>Observación</span><textarea pTextarea formControlName="observation" rows="3"></textarea></label></div><div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="progressDialog.set(false)" /><p-button type="submit" label="Registrar avance" icon="pi pi-plus" [loading]="saving()" /></div></form></p-dialog>

    <p-dialog [visible]="closeDialog()" (visibleChange)="closeDialog.set($event)" [modal]="true" [style]="{width:'min(520px,96vw)'}" header="Cerrar requerimiento" [draggable]="false"><p class="intro">La observación es obligatoria cuando exista faltante o excedente. El resultado Cerrado será consultable por la cuarta iteración.</p><label class="single-field"><span>Observación de cierre</span><textarea pTextarea [ngModel]="closeObservation()" (ngModelChange)="closeObservation.set($event)" rows="4"></textarea></label><div class="dialog-footer"><p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="closeDialog.set(false)" /><p-button label="Cerrar y preservar resultado" icon="pi pi-check" severity="success" [loading]="saving()" (onClick)="close()" /></div></p-dialog>

    <p-dialog [visible]="historyDialog()" (visibleChange)="historyDialog.set($event)" [modal]="true" [style]="{width:'min(720px,96vw)'}" header="Historial de consolidación" [draggable]="false"><div class="timeline">@for (event of history(); track event.id) { <div><span class="dot"></span><article><header><strong>{{ event.event }}</strong><small>{{ formatDate(event.occurredAt,true) }}</small></header><p>{{ event.observation || 'Sin observación' }}</p><footer>{{ event.previousStatus || 'INICIO' }} → {{ event.newStatus }} · {{ event.user.name }}</footer></article></div> } @empty { <div class="empty"><strong>Sin eventos</strong></div> }</div></p-dialog>
  `,
  styles: [`
    .page-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.8rem,3vw,2.7rem);letter-spacing:-.05em}.page-toolbar p,.intro{margin:0;color:var(--text-muted);font-size:.75rem;line-height:1.55}.eyebrow{color:var(--accent);font-size:.68rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.view-tabs{display:flex;gap:.35rem;margin-bottom:1rem;padding:.3rem;border:1px solid var(--surface-border);border-radius:.8rem;background:#fff;width:max-content}.view-tabs button{display:flex;align-items:center;gap:.45rem;padding:.55rem .85rem;border:0;border-radius:.6rem;background:transparent;color:#566b7e;font-size:.7rem;font-weight:750;cursor:pointer}.view-tabs button.active{background:var(--brand-800);color:#fff}.filters{display:grid;grid-template-columns:repeat(3,minmax(10rem,1fr)) auto;align-items:end;gap:.65rem;margin-bottom:1rem}.filters label,.form-grid label,.single-field{display:grid;gap:.35rem}.filters span,.form-grid span,.single-field span{color:#344b61;font-size:.65rem;font-weight:750}.filters input,.single-field textarea{width:100%}.table-card{overflow:hidden;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.stack strong,.stack small{display:block}.stack small{margin-top:.2rem;color:var(--text-muted);font-size:.62rem}.type-badge{padding:.28rem .5rem;border-radius:99px;background:#eef5fa;color:#315470;font-size:.6rem;font-weight:800}.actions,.detail-actions{display:flex;flex-wrap:wrap;gap:.35rem}.empty{min-height:10rem;display:grid;place-items:center;align-content:center;gap:.45rem;color:var(--text-muted)}.empty i{font-size:2rem}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;margin-bottom:1rem}.metrics article{padding:1rem;border:1px solid var(--surface-border);border-radius:.85rem;background:#fff}.metrics span,.metrics strong{display:block}.metrics span{color:var(--text-muted);font-size:.62rem}.metrics strong{margin-top:.35rem;font-size:1.35rem}.negative{color:#b4232b}.positive{color:#16794d}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem}.form-grid .wide{grid-column:1/-1}.dialog-footer{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--surface-border)}.detail-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:.65rem;margin-bottom:1rem}.detail-summary>div{padding:.8rem;border-radius:.7rem;background:#f4f8fb}.detail-summary span,.detail-summary strong{display:block}.detail-summary span{color:var(--text-muted);font-size:.6rem}.detail-summary strong{margin-top:.25rem;font-size:.72rem}.detail-table{overflow:auto;border:1px solid var(--surface-border);border-radius:.8rem}.detail-table table{width:100%;min-width:48rem;border-collapse:collapse}.detail-table th,.detail-table td{padding:.7rem .8rem;border-bottom:1px solid var(--surface-border);font-size:.7rem;text-align:left}.detail-table th{color:#5f7285;background:#f7fafc;font-size:.6rem;text-transform:uppercase}.empty-row{text-align:center!important;color:var(--text-muted)}.source-link{border:0;background:transparent;color:var(--brand-700);font-size:.68rem;font-weight:800;text-decoration:underline;cursor:pointer}.detail-actions{justify-content:flex-end;margin-top:1rem}.timeline{display:grid}.timeline>div{position:relative;display:grid;grid-template-columns:1.2rem 1fr;gap:.7rem;padding-bottom:1rem}.timeline>div:before{content:'';position:absolute;left:.36rem;top:.8rem;bottom:-.2rem;width:1px;background:#b7d3e3}.timeline>div:last-child:before{display:none}.dot{position:relative;z-index:1;width:.75rem;height:.75rem;margin-top:.25rem;border:3px solid #dceef8;border-radius:50%;background:var(--brand-700)}.timeline article{padding:.8rem;border:1px solid var(--surface-border);border-radius:.7rem}.timeline header{display:flex;justify-content:space-between;gap:1rem}.timeline header small,.timeline footer{color:var(--text-muted);font-size:.62rem}.timeline p{margin:.4rem 0;font-size:.7rem}@media(max-width:760px){.page-toolbar{align-items:flex-start;flex-direction:column}.filters,.metrics,.form-grid,.detail-summary{grid-template-columns:1fr}.form-grid .wide{grid-column:auto}.view-tabs{width:100%}.view-tabs button{flex:1;justify-content:center}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductionComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);

  protected readonly consolidations = signal<ProductionConsolidation[]>([]);
  protected readonly summary = signal<ProductionSummaryRow[]>([]);
  protected readonly lines = signal<ProductLine[]>([]);
  protected readonly selected = signal<ProductionConsolidation | null>(null);
  protected readonly selectedDetail = signal<ProductionConsolidationDetail | null>(null);
  protected readonly visibleSources = signal<ProductionConsolidationSource[]>([]);
  protected readonly history = signal<ProductionHistory[]>([]);
  protected readonly view = signal<'consolidations' | 'summary'>('consolidations');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dateFilter = signal('');
  protected readonly lineFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<ProductionConsolidationStatus | null>(null);
  protected readonly generationDialog = signal(false);
  protected readonly complementaryGeneration = signal(false);
  protected readonly detailDialog = signal(false);
  protected readonly sourcesDialog = signal(false);
  protected readonly progressDialog = signal(false);
  protected readonly closeDialog = signal(false);
  protected readonly historyDialog = signal(false);
  protected readonly closeObservation = signal('');
  protected readonly statusOptions = [
    { label: 'Borrador', value: 'BORRADOR' },
    { label: 'Emitida', value: 'EMITIDA' },
    { label: 'En proceso', value: 'EN_PROCESO' },
    { label: 'Cerrada', value: 'CERRADA' },
  ];
  protected readonly generationForm = this.fb.nonNullable.group({
    deliveryDate: ['', Validators.required],
    productLineId: [''],
  });
  protected readonly progressForm = this.fb.nonNullable.group({
    quantity: [0, [Validators.required, Validators.min(0.000001)]],
    observation: [''],
  });

  ngOnInit(): void {
    this.loadLines();
    this.loadConsolidations();
  }

  protected setView(view: 'consolidations' | 'summary'): void {
    this.view.set(view);
    this.reload();
  }

  protected reload(): void {
    this.view() === 'summary' ? this.loadSummary() : this.loadConsolidations();
  }

  private params(): HttpParams {
    let params = new HttpParams().set('limit', 100);
    if (this.dateFilter()) params = params.set('deliveryDate', this.dateFilter());
    if (this.lineFilter()) params = params.set('productLineId', this.lineFilter()!);
    if (this.statusFilter() && this.view() === 'consolidations') params = params.set('status', this.statusFilter()!);
    return params;
  }

  private loadLines(): void {
    if (this.auth.can('catalog.read')) {
      this.http.get<Paginated<CommercialCatalogProduct>>('/api/catalogo', { params: new HttpParams().set('limit', 100) }).subscribe({
        next: (response) => {
          const unique = new Map(response.data.map((product) => [product.productLine.id, product.productLine]));
          const allowed = this.auth.user()?.productLineIds ?? [];
          this.lines.set([...unique.values()].filter((line) => !allowed.length || allowed.includes(line.id)).sort((a, b) => a.name.localeCompare(b.name)));
        },
      });
      return;
    }
    this.http.get<Paginated<ProductionSummaryRow>>('/api/production-summary', { params: new HttpParams().set('limit', 100) }).subscribe({
      next: (response) => {
        const unique = new Map(response.data.map((row) => [row.productLineId, { id: row.productLineId, name: row.productLineName, status: 'ACTIVO' as const }]));
        this.lines.set([...unique.values()].sort((a, b) => a.name.localeCompare(b.name)));
      },
    });
  }

  private loadConsolidations(): void {
    this.loading.set(true);
    const path = this.auth.can('production.requirements.read') && !this.auth.can('production.consolidations.create')
      ? '/api/production-requirements'
      : '/api/production-consolidations';
    this.http.get<Paginated<ProductionConsolidation>>(path, { params: this.params() }).subscribe({
      next: (response) => { this.consolidations.set(response.data); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  private loadSummary(): void {
    this.loading.set(true);
    this.http.get<Paginated<ProductionSummaryRow>>('/api/production-summary', { params: this.params() }).subscribe({
      next: (response) => { this.summary.set(response.data); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  protected openGeneration(complementary: boolean, deliveryDate = this.dateFilter()): void {
    this.complementaryGeneration.set(complementary);
    this.generationForm.reset({ deliveryDate, productLineId: this.lineFilter() ?? '' });
    this.generationDialog.set(true);
  }

  protected generate(): void {
    if (this.generationForm.invalid) return this.generationForm.markAllAsTouched();
    this.saving.set(true);
    const raw = this.generationForm.getRawValue();
    const payload = { deliveryDate: raw.deliveryDate, productLineId: raw.productLineId || undefined };
    const path = this.complementaryGeneration() ? '/api/production-consolidations/complementary' : '/api/production-consolidations';
    this.http.post<ProductionConsolidation>(path, payload).subscribe({
      next: (item) => { this.saving.set(false); this.generationDialog.set(false); this.saved('Consolidación generada', `Versión ${item.version} · ${item.type}`); this.loadConsolidations(); },
      error: (error) => this.failSave(error),
    });
  }

  protected openDetail(item: ProductionConsolidation): void {
    this.http.get<ProductionConsolidation>(`/api/production-consolidations/${item.id}`).subscribe({
      next: (value) => { this.selected.set(value); this.detailDialog.set(true); },
      error: (error) => this.fail(error),
    });
  }

  protected recalculate(item: ProductionConsolidation): void {
    this.action(`/api/production-consolidations/${item.id}/recalculate`, 'Borrador recalculado');
  }

  protected emit(item: ProductionConsolidation): void {
    this.action(`/api/production-consolidations/${item.id}/emit`, 'Requerimiento emitido');
  }

  private action(path: string, message: string): void {
    this.saving.set(true);
    this.http.post<ProductionConsolidation>(path, {}).subscribe({
      next: (value) => { this.saving.set(false); this.selected.set(value); this.saved(message, `Versión ${value.version}`); this.loadConsolidations(); },
      error: (error) => this.failSave(error),
    });
  }

  protected openSources(item: ProductionConsolidation, detail: ProductionConsolidationDetail): void {
    this.http.get<ProductionConsolidationSource[]>(`/api/production-consolidations/${item.id}/sources`).subscribe({
      next: (sources) => { this.visibleSources.set(sources.filter((source) => source.consolidatedDetailId === detail.id)); this.sourcesDialog.set(true); },
      error: (error) => this.fail(error),
    });
  }

  protected openProgress(detail: ProductionConsolidationDetail): void {
    this.selectedDetail.set(detail);
    this.progressForm.reset({ quantity: 0, observation: '' });
    this.progressDialog.set(true);
  }

  protected registerProgress(): void {
    const item = this.selected();
    const detail = this.selectedDetail();
    if (!item || !detail || this.progressForm.invalid) return this.progressForm.markAllAsTouched();
    const raw = this.progressForm.getRawValue();
    this.saving.set(true);
    this.http.post<ProductionConsolidation>(`/api/production-consolidations/${item.id}/progress`, {
      consolidatedDetailId: detail.id,
      quantity: raw.quantity,
      observation: raw.observation || undefined,
    }).subscribe({
      next: (value) => { this.saving.set(false); this.progressDialog.set(false); this.selected.set(value); this.saved('Avance registrado', detail.product.name); this.loadConsolidations(); },
      error: (error) => this.failSave(error),
    });
  }

  protected openClose(): void {
    this.closeObservation.set('');
    this.closeDialog.set(true);
  }

  protected close(): void {
    const item = this.selected();
    if (!item) return;
    this.saving.set(true);
    this.http.post<ProductionConsolidation>(`/api/production-consolidations/${item.id}/close`, { observation: this.closeObservation() || undefined }).subscribe({
      next: (value) => { this.saving.set(false); this.closeDialog.set(false); this.selected.set(value); this.saved('Requerimiento cerrado', `Versión ${value.version}`); this.loadConsolidations(); },
      error: (error) => this.failSave(error),
    });
  }

  protected openHistory(item: ProductionConsolidation): void {
    this.http.get<ProductionHistory[]>(`/api/production-consolidations/${item.id}/history`).subscribe({
      next: (events) => { this.history.set(events); this.historyDialog.set(true); },
      error: (error) => this.fail(error),
    });
  }

  protected detailTitle(): string {
    const item = this.selected();
    return item ? `Consolidación ${item.type} · versión ${item.version}` : 'Consolidación';
  }

  protected pending(detail: ProductionConsolidationDetail): string {
    return this.number(Math.max(Number(detail.requestedQuantity) - Number(detail.preparedQuantity), 0));
  }

  protected severity(status: ProductionConsolidationStatus): 'info' | 'warn' | 'success' | 'secondary' {
    return status === 'CERRADA' ? 'success' : status === 'EN_PROCESO' ? 'warn' : status === 'EMITIDA' ? 'info' : 'secondary';
  }

  protected statusLabel(status: ProductionConsolidationStatus): string {
    return status === 'EN_PROCESO' ? 'EN PROCESO' : status;
  }

  protected formatDate(value: string | null, withTime: boolean): string {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-BO', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' })
      .format(new Date(value.length === 10 ? `${value}T12:00:00` : value));
  }

  protected number(value: string | number): string {
    return new Intl.NumberFormat('es-BO', { maximumFractionDigits: 6 }).format(Number(value));
  }

  protected numberValue(value: string | number): number { return Number(value); }
  protected total(key: keyof Pick<ProductionSummaryRow, 'requestedQuantity' | 'preparedQuantity' | 'pendingQuantity' | 'difference'>): string { return this.number(this.totalNumber(key)); }
  protected totalNumber(key: keyof Pick<ProductionSummaryRow, 'requestedQuantity' | 'preparedQuantity' | 'pendingQuantity' | 'difference'>): number { return this.summary().reduce((sum, row) => sum + Number(row[key]), 0); }

  private saved(summary: string, detail: string): void { this.messages.add({ severity: 'success', summary, detail }); }
  private fail(error: unknown): void { this.loading.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo cargar Producción', detail: this.error(error) }); }
  private failSave(error: unknown): void { this.saving.set(false); this.messages.add({ severity: 'error', summary: 'No se pudo completar la operación', detail: this.error(error) }); }
  private error(error: unknown): string { if (!(error instanceof HttpErrorResponse)) return 'Error inesperado'; const message = error.error?.message; return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse'; }
}
