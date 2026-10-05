import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../core/auth.service';
import { CommercialCatalogProduct, Customer, Paginated } from '../core/models';

@Component({
  selector: 'app-commercial-catalog',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, TagModule],
  template: `
    <div class="page-toolbar">
      <div><span class="eyebrow">Catálogo comercial</span><h2>Productos disponibles</h2><p>Solo se muestran productos y presentaciones activos con la condición comercial seleccionada.</p></div>
    </div>
    <div class="catalog-filters">
      <label class="search-field"><i class="pi pi-search"></i><input pInputText [ngModel]="search()" (ngModelChange)="search.set($event)" (keyup.enter)="load()" placeholder="Producto, código o presentación" /></label>
      @if (auth.user()?.type === 'INTERNO' && customers().length) {
        <p-select [options]="customers()" optionLabel="businessName" optionValue="id" [ngModel]="customerId()" (ngModelChange)="customerId.set($event); load()" placeholder="Seleccionar cliente" [filter]="true" />
      }
      <p-button label="Buscar" icon="pi pi-search" [outlined]="true" (onClick)="load()" />
    </div>
    @if (loading()) { <div class="catalog-empty"><i class="pi pi-spin pi-spinner"></i><span>Cargando catálogo…</span></div> }
    @else {
      <div class="catalog-grid">
        @for (product of products(); track product.id) {
          <article class="product-card">
            <header><span class="product-code">{{ product.code }}</span><p-tag severity="info" [value]="product.category.name" /></header>
            <div class="product-symbol"><i class="pi pi-box"></i></div>
            <h3>{{ product.name }}</h3><p>{{ product.productLine.name }}</p>
            <div class="presentation-list">
              @for (presentation of product.presentations; track presentation.id) {
                <div><span><strong>{{ presentation.description }}</strong><small>{{ presentation.unit.abbreviation }} · factor {{ presentation.conversionFactor }}</small></span>@if (presentation.price) { <b>Bs {{ presentation.price.amount }}</b> } @else { <em>Precio según cliente</em> }</div>
              }
            </div>
          </article>
        } @empty {
          <div class="catalog-empty"><i class="pi pi-shopping-bag"></i><strong>No hay productos aplicables</strong><span>@if (auth.user()?.type === 'INTERNO' && !customerId()) { Selecciona un cliente para resolver sus precios. } @else { Revisa los productos activos y sus vigencias de precio. }</span></div>
        }
      </div>
    }
  `,
  styles: [`
    .page-toolbar{display:flex;justify-content:space-between;margin-bottom:1.5rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.8rem,3vw,2.7rem);letter-spacing:-.05em}.page-toolbar p{margin:0;color:var(--text-muted);font-size:.8rem}.eyebrow{color:var(--accent);font-size:.68rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.catalog-filters{display:grid;grid-template-columns:minmax(16rem,1.2fr) minmax(14rem,.8fr) auto;gap:.7rem;align-items:end;margin-bottom:1rem}.search-field{position:relative}.search-field i{position:absolute;z-index:1;left:.85rem;top:50%;translate:0 -50%;color:#978e88}.search-field input{width:100%;padding-left:2.55rem}.catalog-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.product-card{min-width:0;padding:1.25rem;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.product-card header{display:flex;align-items:center;justify-content:space-between;gap:.6rem}.product-code{color:var(--brand-700);font-size:.67rem;font-weight:900;letter-spacing:.08em}.product-symbol{width:3.2rem;height:3.2rem;display:grid;place-items:center;margin:1.2rem 0 .8rem;border-radius:.9rem;color:var(--accent);background:#fee8e8;font-size:1.3rem}.product-card h3{margin:0;font-size:1.05rem}.product-card>p{margin:.25rem 0 1rem;color:var(--text-muted);font-size:.72rem}.presentation-list{display:grid;gap:.45rem}.presentation-list>div{display:flex;align-items:center;justify-content:space-between;gap:.8rem;padding:.7rem;border-radius:.7rem;background:#f5f9fc}.presentation-list strong,.presentation-list small{display:block}.presentation-list small{margin-top:.15rem;color:var(--text-muted);font-size:.62rem}.presentation-list b{white-space:nowrap;color:var(--brand-900);font-size:.75rem}.presentation-list em{color:var(--text-muted);font-size:.65rem}.catalog-empty{grid-column:1/-1;min-height:14rem;display:grid;place-items:center;align-content:center;gap:.55rem;color:var(--text-muted);text-align:center}.catalog-empty i{font-size:2rem;color:#a9c6d9}@media(max-width:1050px){.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.catalog-grid,.catalog-filters{grid-template-columns:1fr}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommercialCatalogComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);
  protected readonly products = signal<CommercialCatalogProduct[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly customerId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly loading = signal(false);

  ngOnInit(): void {
    if (this.auth.user()?.type === 'INTERNO' && this.auth.can('customers.read')) {
      this.http.get<Paginated<Customer>>('/api/customers', { params: new HttpParams().set('limit', 100).set('status', 'ACTIVO') }).subscribe({
        next: (response) => { this.customers.set(response.data); if (response.data.length) this.customerId.set(response.data[0].id); this.load(); },
        error: (error) => this.fail(error),
      });
    } else this.load();
  }

  protected load(): void {
    this.loading.set(true);
    let params = new HttpParams().set('limit', 100);
    if (this.search().trim()) params = params.set('q', this.search().trim());
    if (this.customerId()) params = params.set('customerId', this.customerId()!);
    this.http.get<Paginated<CommercialCatalogProduct>>('/api/catalogo', { params }).subscribe({
      next: (response) => { this.products.set(response.data); this.loading.set(false); },
      error: (error) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    const detail = error instanceof HttpErrorResponse ? error.error?.message ?? 'No se pudo cargar el catálogo' : 'No se pudo cargar el catálogo';
    this.messages.add({ severity: 'error', summary: 'Catálogo no disponible', detail });
  }
}
