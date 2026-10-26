import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../core/auth.service';
import { CartService } from '../core/cart.service';
import {
  CommercialCatalogPresentation,
  CommercialCatalogProduct,
  Customer,
  CustomerAddress,
  DeliveryOption,
  OrderScheduleSettings,
  Paginated,
} from '../core/models';

@Component({
  selector: 'app-commercial-catalog',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, ButtonModule, DialogModule, InputNumberModule, InputTextModule, SelectModule, TextareaModule],
  template: `
    <div class="page-toolbar">
      <div>
        <span class="eyebrow">Catálogo comercial</span>
        <h2>Elige tus productos</h2>
        <p>Explora el catálogo, selecciona una presentación y prepara tu pedido.</p>
      </div>
      <div class="toolbar-actions">
        @if (auth.can('orders.scheduling.manage')) { <button type="button" class="schedule-button" (click)="openScheduleSettings()"><i class="pi pi-clock"></i> Configurar cierres</button> }
        <button type="button" class="cart-button" [disabled]="!customerId()" (click)="openCart()">
          <span class="cart-icon"><i class="pi pi-shopping-cart"></i>@if (cart.itemCount()) { <b>{{ cart.itemCount() }}</b> }</span>
          <span><small>Tu carrito</small><strong>Bs {{ money(cart.total()) }}</strong></span>
          <i class="pi pi-chevron-right"></i>
        </button>
      </div>
    </div>

    <div class="catalog-filters">
      <label class="filter-field search-filter"><span>Buscar</span><div class="search-field"><i class="pi pi-search"></i><input pInputText [ngModel]="search()" (ngModelChange)="search.set($event)" placeholder="Nombre, código o presentación" /></div></label>
      <label class="filter-field"><span><b>1</b> Categoría</span><p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" [ngModel]="categoryId()" (ngModelChange)="changeCategory($event)" placeholder="Todas las categorías" [showClear]="true" /></label>
      <label class="filter-field"><span><b>2</b> Línea</span><p-select [options]="lineOptions()" optionLabel="label" optionValue="value" [ngModel]="productLineId()" (ngModelChange)="changeLine($event)" placeholder="Selecciona una línea" [showClear]="true" [disabled]="!categoryId()" /></label>
      <label class="filter-field"><span><b>3</b> Producto</span><p-select [options]="productOptions()" optionLabel="label" optionValue="value" [ngModel]="productId()" (ngModelChange)="productId.set($event)" placeholder="Selecciona un producto" [showClear]="true" [filter]="true" [disabled]="!productLineId()" /></label>
      @if (auth.user()?.type === 'INTERNO' && customers().length) {
        <label class="filter-field customer-filter"><span>Cliente del pedido *</span><p-select #customerPicker [options]="customers()" optionLabel="businessName" optionValue="id" [ngModel]="customerId()" (ngModelChange)="changeCustomer($event, customerPicker)" placeholder="Selecciona el cliente antes de comprar" [filter]="true" [showClear]="true" />@if (cart.items().length) { <small class="customer-lock"><i class="pi pi-lock"></i> Cliente bloqueado mientras el carrito tenga productos.</small> }</label>
      }
      <button type="button" class="clear-filters" (click)="clearFilters()"><i class="pi pi-filter-slash"></i> Limpiar filtros</button>
    </div>

    @if (currentCustomer(); as customer) {
      <div class="customer-note"><i class="pi pi-user"></i><span>Precios para <strong>{{ customer.businessName }}</strong></span></div>
    }

    @if (loading()) {
      <div class="catalog-empty"><i class="pi pi-spin pi-spinner"></i><span>Cargando catálogo…</span></div>
    } @else {
      <div class="catalog-grid">
        @for (product of filteredProducts(); track product.id) {
          <article class="product-card" role="button" tabindex="0" (click)="openProduct(product)" (keydown.enter)="openProduct(product)">
            <div class="product-media">
              <img [src]="product.imageUrl || '/assets/icar-logo.jpg'" [alt]="product.imageUrl ? product.name : 'ICAR'" />
              <div class="product-tags"><span><i class="pi pi-tag"></i> {{ product.category.name }}</span><span><i class="pi pi-sitemap"></i> {{ product.productLine.name }}</span></div>
            </div>
            <div class="product-body">
              <span class="product-code">{{ product.code }}</span>
              <h3>{{ product.name }}</h3>
              <div class="product-price">
                @if (lowestPrice(product); as price) { <span>Desde</span><strong>Bs {{ money(price) }}</strong> }
                @else { <em>Precio según cliente</em> }
              </div>
              <div class="presentation-list">
                @for (presentation of product.presentations; track presentation.id) {
                  <div>
                    <span><strong>{{ presentation.description }}</strong><small>{{ presentation.unit.abbreviation }} · factor {{ presentation.conversionFactor }}</small></span>
                    @if (presentation.price) {
                      <button type="button" class="quick-add" title="Agregar al carrito" (click)="quickAdd(product, presentation, $event)"><span>Bs {{ presentation.price.amount }}</span><i class="pi pi-plus"></i></button>
                    } @else { <em>Sin precio aplicable</em> }
                  </div>
                }
              </div>
              <button type="button" class="select-product" (click)="$event.stopPropagation(); openProduct(product)">Elegir presentación <i class="pi pi-arrow-right"></i></button>
            </div>
          </article>
        } @empty {
          <div class="catalog-empty"><i class="pi pi-shopping-bag"></i><strong>No hay productos aplicables</strong><span>@if (auth.user()?.type === 'INTERNO' && !customerId()) { Selecciona un cliente para resolver sus precios. } @else { Revisa los productos activos y sus vigencias de precio. }</span></div>
        }
      </div>
    }

    <p-dialog [visible]="productDialog()" (visibleChange)="productDialog.set($event)" [modal]="true" [style]="{width:'min(780px,96vw)'}" [header]="selectedProduct()?.name || 'Producto'" [draggable]="false">
      @if (selectedProduct(); as product) {
        <div class="product-detail">
          <div class="detail-media">
            <img [src]="product.imageUrl || '/assets/icar-logo.jpg'" [alt]="product.imageUrl ? product.name : 'ICAR'" />
          </div>
          <div class="detail-copy">
            <span class="product-code">{{ product.code }}</span>
            <div class="detail-tags"><span><i class="pi pi-tag"></i> Categoría: {{ product.category.name }}</span><span><i class="pi pi-sitemap"></i> Línea: {{ product.productLine.name }}</span></div>
            <h3>{{ product.name }}</h3>
            <label><span>Presentación *</span><p-select [options]="pricedPresentations(product)" optionLabel="label" optionValue="value" [ngModel]="selectedPresentationId()" (ngModelChange)="selectedPresentationId.set($event)" /></label>
            @if (selectedPresentation(product); as presentation) {
              <div class="selected-price"><span>{{ presentation.unit.abbreviation }} · factor {{ presentation.conversionFactor }}</span><strong>Bs {{ presentation.price?.amount }}</strong></div>
            }
            <label><span>Cantidad *</span><p-inputnumber [ngModel]="productQuantity()" (ngModelChange)="productQuantity.set($event || 1)" [min]="0.001" [step]="1" [maxFractionDigits]="3" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" /></label>
            <p class="price-note"><i class="pi pi-info-circle"></i> El precio será validado nuevamente al procesar el pedido.</p>
          </div>
        </div>
        <div class="dialog-footer"><p-button label="Cancelar" [text]="true" severity="secondary" (onClick)="productDialog.set(false)" /><p-button label="Agregar al carrito" icon="pi pi-shopping-cart" [disabled]="!selectedPresentation(product)" (onClick)="addSelected()" /></div>
      }
    </p-dialog>

    <p-dialog [visible]="cartDialog()" (visibleChange)="cartDialog.set($event)" [modal]="true" [style]="{width:'min(940px,98vw)'}" header="Tu carrito de compras" [draggable]="false">
      @if (cart.items().length) {
        <div class="cart-layout">
          <div class="cart-lines">
            @for (item of cart.items(); track item.presentationId) {
              <article class="cart-line">
                <div class="cart-image">@if (item.imageUrl) { <img [src]="item.imageUrl" [alt]="item.productName" /> } @else { <img src="/assets/icar-logo.jpg" alt="ICAR" /> }</div>
                <div class="cart-description"><span>{{ item.productCode }}</span><strong>{{ item.productName }}</strong><small>{{ item.presentationDescription }} · {{ item.unitAbbreviation }}</small><em>Bs {{ money(item.unitPrice) }} por unidad</em></div>
                <p-inputnumber [ngModel]="item.quantity" (ngModelChange)="cart.changeQuantity(item.presentationId, $event)" [ngModelOptions]="{standalone:true}" [min]="0.001" [step]="1" [maxFractionDigits]="3" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus" />
                <strong class="line-total">Bs {{ money(item.unitPrice * item.quantity) }}</strong>
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" title="Quitar" (onClick)="cart.remove(item.presentationId)" />
              </article>
            }
            <button type="button" class="continue-shopping" (click)="cartDialog.set(false)"><i class="pi pi-arrow-left"></i> Seguir comprando</button>
          </div>
          <form class="checkout" [formGroup]="checkoutForm" (ngSubmit)="checkout()">
            <span class="eyebrow">Resumen del pedido</span>
            @if (currentCustomer(); as customer) { <h3>{{ customer.businessName }}</h3> }
            <label><span>Domicilio de entrega *</span><p-select formControlName="addressId" [options]="addressOptions()" optionLabel="label" optionValue="value" (onChange)="onAddressChange()" /></label>
            <label><span>Fecha de entrega *</span><p-select formControlName="requestedDate" [options]="deliveryOptionItems()" optionLabel="label" optionValue="value" placeholder="Selecciona una fecha habilitada" [loading]="loadingDates()" /></label>
            @if (currentDeliveryOption(); as option) {
              <div class="schedule-summary">
                <div><i class="pi pi-calendar-plus"></i><span>Fecha del pedido</span><strong>{{ formatDateTime(now()) }}</strong></div>
                <div><i class="pi pi-lock"></i><span>Cierre para cambios</span><strong>{{ formatDateTime(option.orderCutoffAt) }}</strong></div>
                <div><i class="pi pi-box"></i><span>Preparación / consolidado</span><strong>{{ formatDateTime(option.preparationAt) }}</strong></div>
                <div><i class="pi pi-truck"></i><span>Entrega</span><strong>{{ formatDate(option.deliveryDate) }}</strong></div>
              </div>
            }
            <label><span>Observaciones</span><textarea pTextarea formControlName="observations" rows="3" placeholder="Indicaciones para el pedido"></textarea></label>
            <div class="checkout-total"><span>Total referencial</span><strong>Bs {{ money(cart.total()) }}</strong></div>
            <p class="price-note"><i class="pi pi-shield"></i> Precios y disponibilidad se validan en el servidor. El pedido se guardará como borrador.</p>
            <p-button type="submit" label="Crear pedido borrador" icon="pi pi-check" [loading]="saving()" [disabled]="!auth.can('orders.create')" styleClass="checkout-button" />
          </form>
        </div>
      } @else {
        <div class="cart-empty"><span class="empty-bag"><i class="pi pi-shopping-cart"></i></span><h3>Tu carrito está vacío</h3><p>Agrega productos del catálogo para preparar tu pedido.</p><p-button label="Explorar productos" icon="pi pi-arrow-left" (onClick)="cartDialog.set(false)" /></div>
      }
    </p-dialog>

    <p-dialog [visible]="cutoffDialog()" (visibleChange)="cutoffDialog.set($event)" [modal]="true" [closable]="false" [style]="{width:'min(590px,96vw)'}" header="Cierre de pedido finalizado" [draggable]="false">
      <div class="cutoff-warning"><i class="pi pi-clock"></i><div><strong>La fecha seleccionada para el pedido ya se cerró.</strong>@if (closedDeliveryDate()) { <p>La entrega elegida era el {{ formatDate(closedDeliveryDate()) }}.</p> }</div></div>
      @if (currentDeliveryOption(); as option) {
        <p class="cutoff-copy">Puedes conservar todos los productos y preparar el pedido para la siguiente fecha disponible: <strong>{{ formatDate(option.deliveryDate) }}</strong>. El nuevo cierre será el {{ formatDateTime(option.orderCutoffAt) }}.</p>
      } @else if (loadingDates()) {
        <p class="cutoff-copy">Estamos consultando la siguiente fecha disponible para la zona.</p>
      } @else {
        <p class="cutoff-copy">No se encontró otra fecha disponible. Puedes cancelar este carrito y volver a intentarlo cuando exista una fecha habilitada.</p>
      }
      <div class="dialog-footer"><p-button label="Cancelar pedido" icon="pi pi-trash" [outlined]="true" severity="danger" (onClick)="cancelClosedCart()" /><p-button label="Preparar para siguiente fecha" icon="pi pi-calendar-plus" [disabled]="!currentDeliveryOption() || loadingDates()" (onClick)="useNextAvailableDate()" /></div>
    </p-dialog>

    <p-dialog [visible]="settingsDialog()" (visibleChange)="settingsDialog.set($event)" [modal]="true" [style]="{width:'min(620px,96vw)'}" header="Configuración de cierres" [draggable]="false">
      <form [formGroup]="settingsForm" (ngSubmit)="saveScheduleSettings()">
        <p class="settings-help">Los horarios se aplican a las nuevas fechas elegidas. Cada pedido conserva sus fechas de cierre y preparación.</p>
        <div class="settings-grid">
          <label><span>Días antes de la entrega para cerrar *</span><p-inputnumber formControlName="orderCutoffLeadDays" [min]="0" [max]="30" [showButtons]="true" /></label>
          <label><span>Hora de cierre de pedidos *</span><input pInputText type="time" formControlName="orderCutoffTime" /></label>
          <label><span>Días antes para preparación *</span><p-inputnumber formControlName="preparationLeadDays" [min]="0" [max]="30" [showButtons]="true" /></label>
          <label><span>Hora límite del consolidado *</span><input pInputText type="time" formControlName="consolidationDeadlineTime" /></label>
        </div>
        <div class="example-note"><i class="pi pi-info-circle"></i> Ejemplo: entrega mañana, 1 día de anticipación, cierre 13:00 y consolidado 18:00 generan ambos hitos para hoy.</div>
        <div class="dialog-footer"><p-button type="button" label="Cancelar" [text]="true" severity="secondary" (onClick)="settingsDialog.set(false)" /><p-button type="submit" label="Guardar configuración" icon="pi pi-save" [loading]="savingSettings()" /></div>
      </form>
    </p-dialog>
  `,
  styles: [`
    .page-toolbar{display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;margin-bottom:1.35rem}.page-toolbar h2{margin:.35rem 0;font-size:clamp(1.9rem,3vw,2.8rem);letter-spacing:-.05em}.page-toolbar p{margin:0;color:var(--text-muted);font-size:.78rem}.eyebrow{color:var(--accent);font-size:.66rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}.toolbar-actions{display:flex;align-items:center;gap:.65rem}.schedule-button{height:2.7rem;padding:0 .85rem;border:1px solid #a8cee3;border-radius:.75rem;color:var(--brand-700);background:#fff;font-size:.66rem;font-weight:800;cursor:pointer}.schedule-button i{margin-right:.35rem}.cart-button{min-width:13rem;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:.75rem;padding:.65rem .85rem;border:0;border-radius:1rem;color:#fff;background:linear-gradient(135deg,var(--brand-900),var(--brand-700));box-shadow:0 .6rem 1.4rem rgba(9,67,114,.18);text-align:left;cursor:pointer}.cart-button:disabled{cursor:not-allowed;filter:grayscale(.3);opacity:.48}.cart-button>span:nth-child(2){display:grid}.cart-button small{font-size:.62rem;opacity:.78}.cart-button strong{margin-top:.08rem;font-size:.83rem}.cart-icon{position:relative;width:2.25rem;height:2.25rem;display:grid;place-items:center;border-radius:.7rem;background:rgba(255,255,255,.13)}.cart-icon b{position:absolute;right:-.4rem;top:-.45rem;min-width:1.1rem;height:1.1rem;display:grid;place-items:center;padding:0 .25rem;border-radius:2rem;color:#fff;background:var(--accent);font-size:.55rem}.catalog-filters{display:grid;grid-template-columns:minmax(15rem,1.2fr) repeat(3,minmax(10rem,.75fr)) auto;gap:.7rem;align-items:end;margin-bottom:.65rem;padding:1rem;border:1px solid var(--surface-border);border-radius:1rem;background:#fff}.filter-field{min-width:0;display:grid;gap:.4rem}.filter-field>span{display:flex;align-items:center;gap:.35rem;color:#4e6577;font-size:.62rem;font-weight:800}.filter-field>span b{width:1.15rem;height:1.15rem;display:grid;place-items:center;border-radius:50%;color:#fff;background:var(--brand-700);font-size:.55rem}.search-field{position:relative}.search-field i{position:absolute;z-index:1;left:.85rem;top:50%;translate:0 -50%;color:#978e88}.search-field input{width:100%;padding-left:2.55rem}.customer-filter{grid-column:1/-2}.customer-lock{display:flex;align-items:center;gap:.3rem;color:#a16207;font-size:.58rem;font-weight:750}.clear-filters{align-self:end;display:flex;align-items:center;justify-content:center;gap:.4rem;height:2.55rem;padding:0 .85rem;border:1px solid #bfd9e8;border-radius:.55rem;color:var(--brand-700);background:#f7fbfe;font-size:.66rem;font-weight:800;cursor:pointer}.customer-note{display:flex;align-items:center;gap:.45rem;margin:0 0 1rem;color:#4d6c83;font-size:.68rem}.customer-note i{color:var(--brand-600)}.catalog-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1.05rem}.product-card{min-width:0;overflow:hidden;border:1px solid var(--surface-border);border-radius:1.15rem;background:#fff;box-shadow:0 .4rem 1.3rem rgba(20,70,105,.06);cursor:pointer;transition:transform .2s,border-color .2s,box-shadow .2s}.product-card:hover,.product-card:focus-visible{transform:translateY(-3px);border-color:#8ec7e7;box-shadow:0 .8rem 1.8rem rgba(20,70,105,.12);outline:none}.product-media{position:relative;height:12rem;overflow:hidden;background:linear-gradient(145deg,#eef7fc,#d9ebf5)}.product-media>img,.detail-media>img{width:100%;height:100%;object-fit:contain;background:#fff}.image-pending{width:100%;height:100%;display:grid;place-items:center;align-content:center;gap:.7rem;background:linear-gradient(145deg,#edf7fd,#d6eaf5)}.image-pending img{width:5.5rem;height:5.5rem;border-radius:50%;object-fit:cover;filter:saturate(.85);opacity:.9}.image-pending span{color:#62829a;font-size:.62rem;font-weight:750;letter-spacing:.08em;text-transform:uppercase}.product-tags{position:absolute;left:.65rem;right:.65rem;top:.65rem;display:flex;flex-wrap:wrap;gap:.3rem}.product-tags span,.detail-tags span{display:flex;align-items:center;gap:.25rem;padding:.32rem .48rem;border-radius:2rem;color:#fff;background:rgba(6,53,96,.88);backdrop-filter:blur(5px);font-size:.54rem;font-weight:800}.product-tags span+span,.detail-tags span+span{background:rgba(216,40,36,.9)}.product-body{padding:1rem}.product-code{color:var(--brand-700);font-size:.61rem;font-weight:850;letter-spacing:.07em;text-transform:uppercase}.product-card h3,.detail-copy h3{margin:.35rem 0 .75rem;color:#172b3b;font-size:1.05rem}.product-price{min-height:2rem;display:flex;align-items:baseline;gap:.35rem;margin-bottom:.75rem}.product-price span{color:var(--text-muted);font-size:.62rem}.product-price strong{color:var(--brand-900);font-size:1.05rem}.product-price em,.presentation-list em{color:var(--text-muted);font-size:.63rem}.presentation-list{display:grid;gap:.4rem}.presentation-list>div{display:flex;align-items:center;justify-content:space-between;gap:.65rem;padding:.62rem .7rem;border-radius:.65rem;background:#f5f9fc}.presentation-list strong,.presentation-list small{display:block}.presentation-list strong{font-size:.68rem}.presentation-list small{margin-top:.12rem;color:var(--text-muted);font-size:.58rem}.quick-add{display:flex;align-items:center;gap:.42rem;padding:.28rem .32rem .28rem .5rem;border:0;border-radius:.45rem;color:var(--brand-900);background:#fff;font-size:.62rem;font-weight:800;cursor:pointer}.quick-add i{width:1.45rem;height:1.45rem;display:grid;place-items:center;border-radius:.35rem;color:#fff;background:var(--accent);font-size:.6rem}.select-product{width:100%;display:flex;align-items:center;justify-content:space-between;margin-top:.8rem;padding:.65rem .75rem;border:1px solid #b9d9eb;border-radius:.65rem;color:var(--brand-700);background:#f7fbfe;font-size:.68rem;font-weight:800;cursor:pointer}.catalog-empty{grid-column:1/-1;min-height:14rem;display:grid;place-items:center;align-content:center;gap:.55rem;color:var(--text-muted);text-align:center}.catalog-empty i{font-size:2rem;color:#a9c6d9}.product-detail{display:grid;grid-template-columns:minmax(16rem,.9fr) 1.1fr;gap:1.5rem;padding-top:.5rem}.detail-media{height:22rem;overflow:hidden;border-radius:1rem;background:#edf6fb}.detail-copy{display:flex;flex-direction:column;justify-content:center}.detail-tags{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.45rem}.detail-copy label,.checkout label,.settings-grid label{display:grid;gap:.4rem;margin-top:.8rem}.detail-copy label>span,.checkout label>span,.settings-grid label>span{color:#344b61;font-size:.68rem;font-weight:750}.selected-price{display:flex;align-items:center;justify-content:space-between;margin-top:.65rem;padding:.7rem;border-radius:.65rem;background:#eff7fb;color:#567187;font-size:.65rem}.selected-price strong{color:var(--brand-900);font-size:.9rem}.price-note{display:flex;gap:.4rem;margin:.8rem 0 0;color:var(--text-muted);font-size:.63rem;line-height:1.45}.dialog-footer{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--surface-border)}.cutoff-warning{display:flex;gap:.8rem;align-items:flex-start;padding:1rem;border:1px solid #fed7aa;border-radius:.8rem;color:#9a3412;background:#fff7ed}.cutoff-warning>i{margin-top:.15rem;font-size:1.25rem}.cutoff-warning strong{display:block;font-size:.82rem}.cutoff-warning p,.cutoff-copy{margin:.35rem 0 0;font-size:.7rem;line-height:1.55}.cutoff-copy{margin-top:1rem;color:var(--text-muted)}.cart-layout{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(18rem,.65fr);gap:1.1rem}.cart-lines{display:grid;align-content:start;gap:.6rem}.cart-line{display:grid;grid-template-columns:4.2rem minmax(9rem,1fr) 8rem auto auto;align-items:center;gap:.7rem;padding:.65rem;border:1px solid var(--surface-border);border-radius:.85rem}.cart-image{width:4.2rem;height:4.2rem;overflow:hidden;border-radius:.65rem;background:#edf6fb}.cart-image img{width:100%;height:100%;object-fit:contain}.cart-description{display:grid;gap:.1rem}.cart-description>span{color:var(--brand-700);font-size:.56rem;font-weight:850}.cart-description>strong{font-size:.76rem}.cart-description small,.cart-description em{color:var(--text-muted);font-size:.59rem}.line-total{white-space:nowrap;color:var(--brand-900);font-size:.73rem}.continue-shopping{justify-self:start;display:flex;align-items:center;gap:.4rem;padding:.55rem 0;border:0;color:var(--brand-700);background:transparent;font-size:.68rem;font-weight:800;cursor:pointer}.checkout{align-self:start;padding:1.1rem;border-radius:1rem;background:#f3f8fb}.checkout h3{margin:.3rem 0 .8rem;font-size:1rem}.checkout input,.checkout textarea,.settings-grid input{width:100%}.schedule-summary{display:grid;gap:.4rem;margin-top:.8rem}.schedule-summary>div{display:grid;grid-template-columns:1.3rem 1fr;gap:.08rem .45rem;padding:.5rem .6rem;border-radius:.55rem;background:#fff}.schedule-summary i{grid-row:1/3;color:var(--brand-600);align-self:center}.schedule-summary span{color:var(--text-muted);font-size:.55rem}.schedule-summary strong{font-size:.64rem}.checkout-total{display:flex;align-items:flex-end;justify-content:space-between;margin-top:1rem;padding-top:1rem;border-top:1px solid #cbdde8}.checkout-total span{color:var(--text-muted);font-size:.7rem}.checkout-total strong{color:var(--brand-900);font-size:1.2rem}.checkout-button{width:100%;margin-top:1rem}.settings-help{margin:0;color:var(--text-muted);font-size:.7rem;line-height:1.5}.settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem 1rem}.example-note{display:flex;gap:.45rem;margin-top:1rem;padding:.75rem;border-radius:.65rem;color:#45657b;background:#edf7fc;font-size:.65rem;line-height:1.45}.cart-empty{min-height:20rem;display:grid;place-items:center;align-content:center;text-align:center}.cart-empty .empty-bag{width:4.5rem;height:4.5rem;display:grid;place-items:center;border-radius:50%;color:var(--brand-700);background:#e8f4fb;font-size:1.5rem}.cart-empty h3{margin:1rem 0 .3rem}.cart-empty p{margin:0 0 1rem;color:var(--text-muted);font-size:.72rem}@media(max-width:1450px){.catalog-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.catalog-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.search-filter{grid-column:span 2}.customer-filter{grid-column:span 2}}@media(max-width:1100px){.catalog-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.cart-layout{grid-template-columns:1fr}}@media(max-width:720px){.page-toolbar{align-items:flex-start;flex-direction:column}.toolbar-actions{width:100%;align-items:stretch;flex-direction:column}.cart-button{width:100%}.catalog-grid,.catalog-filters,.product-detail,.settings-grid{grid-template-columns:1fr}.search-filter,.customer-filter{grid-column:auto}.product-media{height:12rem}.detail-media{height:15rem}.cart-line{grid-template-columns:3.6rem 1fr auto}.cart-image{width:3.6rem;height:3.6rem}.cart-line p-inputnumber{grid-column:2}.line-total{grid-column:3;grid-row:2}.cart-line>p-button{grid-column:3;grid-row:1}.checkout{padding:.9rem}}
    @media(min-width:1101px){.catalog-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CommercialCatalogComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  protected readonly auth = inject(AuthService);
  protected readonly cart = inject(CartService);
  protected readonly products = signal<CommercialCatalogProduct[]>([]);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly customerId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly productLineId = signal<string | null>(null);
  protected readonly productId = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly loadingDates = signal(false);
  protected readonly deliveryOptions = signal<DeliveryOption[]>([]);
  protected readonly now = signal(new Date().toISOString());
  protected readonly productDialog = signal(false);
  protected readonly cartDialog = signal(false);
  protected readonly cutoffDialog = signal(false);
  protected readonly closedDeliveryDate = signal('');
  protected readonly settingsDialog = signal(false);
  protected readonly savingSettings = signal(false);
  protected readonly selectedProduct = signal<CommercialCatalogProduct | null>(null);
  protected readonly selectedPresentationId = signal<string | null>(null);
  protected readonly productQuantity = signal(1);
  protected readonly checkoutForm = this.fb.nonNullable.group({
    addressId: ['', Validators.required],
    requestedDate: ['', Validators.required],
    observations: [''],
  });
  protected readonly settingsForm = this.fb.nonNullable.group({
    orderCutoffTime: ['13:00', Validators.required],
    orderCutoffLeadDays: [1, [Validators.required, Validators.min(0), Validators.max(30)]],
    consolidationDeadlineTime: ['18:00', Validators.required],
    preparationLeadDays: [1, [Validators.required, Validators.min(0), Validators.max(30)]],
  });

  ngOnInit(): void {
    const user = this.auth.user();
    if (user?.type === 'INTERNO' && this.auth.can('customers.read')) {
      this.http.get<Paginated<Customer>>('/api/clientes', { params: new HttpParams().set('limit', 100).set('status', 'ACTIVO') }).subscribe({
        next: (response) => {
          this.customers.set(response.data);
          this.products.set([]);
          this.loading.set(false);
        },
        error: (error) => this.fail(error),
      });
      return;
    }
    if (user?.customerId) {
      this.http.get<Customer>(`/api/clientes/${user.customerId}`).subscribe({
        next: (customer) => { this.customers.set([customer]); this.activateCustomer(customer.id); },
        error: (error) => this.fail(error),
      });
      return;
    }
    this.load();
  }

  protected changeCustomer(id: string | null, picker?: { writeValue(value: string | null): void }): void {
    const currentId = this.customerId();
    if (this.cart.items().length && id !== currentId) {
      picker?.writeValue(currentId);
      this.messages.add({
        severity: 'warn',
        summary: 'Pedido en proceso',
        detail: 'Debes concluir el pedido o eliminar todos los productos del carrito antes de seleccionar otro cliente.',
      });
      return;
    }
    if (id) this.activateCustomer(id);
    else {
      this.customerId.set(null);
      this.products.set([]);
      this.deliveryOptions.set([]);
      this.checkoutForm.reset({ addressId: '', requestedDate: '', observations: '' });
      this.productDialog.set(false);
      this.cartDialog.set(false);
    }
  }

  protected categoryOptions(): {label: string; value: string}[] {
    return this.uniqueOptions(this.products().map((product) => ({ label: product.category.name, value: product.category.id })));
  }

  protected lineOptions(): {label: string; value: string}[] {
    return this.uniqueOptions(this.products()
      .filter((product) => !this.categoryId() || product.category.id === this.categoryId())
      .map((product) => ({ label: product.productLine.name, value: product.productLine.id })));
  }

  protected productOptions(): {label: string; value: string}[] {
    return this.products()
      .filter((product) => (!this.categoryId() || product.category.id === this.categoryId())
        && (!this.productLineId() || product.productLine.id === this.productLineId()))
      .map((product) => ({ label: `${product.name} · ${product.code}`, value: product.id }));
  }

  protected filteredProducts(): CommercialCatalogProduct[] {
    const term = this.search().trim().toLocaleLowerCase('es');
    return this.products().filter((product) => {
      const matchesSearch = !term || [product.name, product.code, ...product.presentations.map((item) => item.description)]
        .some((value) => String(value).toLocaleLowerCase('es').includes(term));
      return matchesSearch
        && (!this.categoryId() || product.category.id === this.categoryId())
        && (!this.productLineId() || product.productLine.id === this.productLineId())
        && (!this.productId() || product.id === this.productId());
    });
  }

  protected changeCategory(id: string | null): void {
    this.categoryId.set(id);
    this.productLineId.set(null);
    this.productId.set(null);
  }

  protected changeLine(id: string | null): void {
    this.productLineId.set(id);
    this.productId.set(null);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.categoryId.set(null);
    this.productLineId.set(null);
    this.productId.set(null);
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

  protected currentCustomer(): Customer | undefined { return this.customers().find((customer) => customer.id === this.customerId()); }
  protected lowestPrice(product: CommercialCatalogProduct): number | null {
    const prices = product.presentations.flatMap((presentation) => presentation.price ? [Number(presentation.price.amount)] : []);
    return prices.length ? Math.min(...prices) : null;
  }
  protected money(value: number): string { return value.toFixed(2); }
  protected pricedPresentations(product: CommercialCatalogProduct): {label: string; value: string}[] {
    return product.presentations.filter((presentation) => presentation.price).map((presentation) => ({
      label: `${presentation.description} · ${presentation.unit.abbreviation} · Bs ${presentation.price!.amount}`,
      value: presentation.id,
    }));
  }
  protected selectedPresentation(product: CommercialCatalogProduct): CommercialCatalogPresentation | undefined {
    return product.presentations.find((presentation) => presentation.id === this.selectedPresentationId() && presentation.price);
  }

  protected openProduct(product: CommercialCatalogProduct): void {
    if (!this.requireCustomer()) return;
    const presentation = product.presentations.find((item) => item.price);
    if (!presentation) {
      this.messages.add({ severity: 'warn', summary: 'Producto sin precio', detail: 'No existe una presentación con precio aplicable para este cliente.' });
      return;
    }
    this.selectedProduct.set(product);
    this.selectedPresentationId.set(presentation.id);
    this.productQuantity.set(1);
    this.productDialog.set(true);
  }

  protected quickAdd(product: CommercialCatalogProduct, presentation: CommercialCatalogPresentation, event: Event): void {
    event.stopPropagation();
    if (!this.requireCustomer()) return;
    this.cart.add(product, presentation, 1);
    this.cartDialog.set(true);
    this.messages.add({ severity: 'success', summary: 'Producto agregado', detail: `${product.name} · ${presentation.description}` });
  }

  protected addSelected(): void {
    if (!this.requireCustomer()) return;
    const product = this.selectedProduct();
    const presentation = product ? this.selectedPresentation(product) : undefined;
    if (!product || !presentation || this.productQuantity() <= 0) return;
    this.cart.add(product, presentation, this.productQuantity());
    this.productDialog.set(false);
    this.cartDialog.set(true);
    this.messages.add({ severity: 'success', summary: 'Producto agregado', detail: `${product.name} · ${presentation.description}` });
  }

  protected openCart(): void {
    if (!this.requireCustomer()) return;
    if (!this.checkoutForm.controls.addressId.value) this.prepareCheckout();
    this.cartDialog.set(true);
  }

  protected addressOptions(): {label: string; value: string}[] {
    return (this.currentCustomer()?.addresses ?? []).filter((address) => address.status === 'ACTIVO').map((address) => ({
      label: `${address.label} · ${address.address}`,
      value: address.id,
    }));
  }

  protected onAddressChange(): void {
    this.loadDeliveryOptions();
  }

  protected deliveryOptionItems(): {label: string; value: string}[] {
    return this.deliveryOptions().map((option) => ({
      label: `${this.formatDate(option.deliveryDate)} · cierre ${this.formatDateTime(option.orderCutoffAt)}`,
      value: option.deliveryDate,
    }));
  }

  protected currentDeliveryOption(): DeliveryOption | undefined {
    return this.deliveryOptions().find((option) => option.deliveryDate === this.checkoutForm.controls.requestedDate.value);
  }

  protected formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(`${value}T12:00:00.000Z`));
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
      .format(new Date(value));
  }

  protected openScheduleSettings(): void {
    this.http.get<OrderScheduleSettings>('/api/order-scheduling/settings').subscribe({
      next: (settings) => {
        this.settingsForm.reset({
          orderCutoffTime: settings.orderCutoffTime.slice(0, 5),
          orderCutoffLeadDays: settings.orderCutoffLeadDays,
          consolidationDeadlineTime: settings.consolidationDeadlineTime.slice(0, 5),
          preparationLeadDays: settings.preparationLeadDays,
        });
        this.settingsDialog.set(true);
      },
      error: (error) => this.fail(error),
    });
  }

  protected saveScheduleSettings(): void {
    if (this.settingsForm.invalid) return this.settingsForm.markAllAsTouched();
    this.savingSettings.set(true);
    this.http.patch<OrderScheduleSettings>('/api/order-scheduling/settings', this.settingsForm.getRawValue()).subscribe({
      next: () => {
        this.savingSettings.set(false);
        this.settingsDialog.set(false);
        this.loadDeliveryOptions();
        this.messages.add({ severity: 'success', summary: 'Configuración guardada', detail: 'Los nuevos cierres se aplicarán a las próximas fechas de pedido.' });
      },
      error: (error) => { this.savingSettings.set(false); this.fail(error); },
    });
  }

  protected checkout(): void {
    if (this.checkoutForm.invalid || !this.cart.items().length || !this.customerId()) {
      this.checkoutForm.markAllAsTouched();
      this.messages.add({ severity: 'warn', summary: 'Pedido incompleto', detail: 'Selecciona un domicilio, una fecha y agrega al menos un producto.' });
      return;
    }
    const raw = this.checkoutForm.getRawValue();
    const payload = {
      ...(this.auth.user()?.type === 'INTERNO' ? { customerId: this.customerId()! } : {}),
      addressId: raw.addressId,
      requestedDate: raw.requestedDate,
      observations: raw.observations.trim() || undefined,
      details: this.cart.items().map((item) => ({ presentationId: item.presentationId, quantity: item.quantity })),
    };
    this.saving.set(true);
    this.http.post<{code: string}>('/api/pedidos', payload).subscribe({
      next: (order) => {
        this.saving.set(false);
        this.cart.clear();
        this.cartDialog.set(false);
        this.prepareCheckout();
        this.messages.add({ severity: 'success', summary: 'Pedido borrador creado', detail: `${order.code} está listo para ser revisado y enviado.` });
      },
      error: (error) => this.handleCheckoutError(error),
    });
  }

  protected useNextAvailableDate(): void {
    const option = this.currentDeliveryOption();
    if (!option) return;
    this.cutoffDialog.set(false);
    this.messages.add({ severity: 'info', summary: 'Pedido preparado para la siguiente fecha', detail: `Entrega: ${this.formatDate(option.deliveryDate)}. Revisa el resumen y vuelve a crear el pedido.` });
  }

  protected cancelClosedCart(): void {
    this.cart.clear();
    this.cutoffDialog.set(false);
    this.cartDialog.set(false);
    this.closedDeliveryDate.set('');
    this.prepareCheckout();
    this.messages.add({ severity: 'info', summary: 'Pedido cancelado', detail: 'Se eliminaron los productos del carrito.' });
  }

  private activateCustomer(id: string): void {
    this.customerId.set(id);
    const userId = this.auth.user()?.id;
    if (userId) this.cart.useScope(userId, id);
    this.prepareCheckout();
    this.clearFilters();
    this.load();
  }

  private uniqueOptions(options: {label: string; value: string}[]): {label: string; value: string}[] {
    return [...new Map(options.map((option) => [option.value, option])).values()]
      .sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }

  private prepareCheckout(): void {
    const address = this.currentCustomer()?.addresses.find((item) => item.status === 'ACTIVO');
    this.checkoutForm.reset({ addressId: address?.id ?? '', requestedDate: '', observations: '' });
    this.loadDeliveryOptions();
  }

  private currentAddress(): CustomerAddress | undefined {
    return this.currentCustomer()?.addresses.find((address) => address.id === this.checkoutForm.controls.addressId.value);
  }

  private loadDeliveryOptions(): void {
    const addressId = this.checkoutForm.controls.addressId.value;
    const customerId = this.customerId();
    this.deliveryOptions.set([]);
    this.checkoutForm.controls.requestedDate.setValue('');
    if (!addressId || !customerId) return;
    this.loadingDates.set(true);
    let params = new HttpParams().set('addressId', addressId);
    if (this.auth.user()?.type === 'INTERNO') params = params.set('customerId', customerId);
    this.http.get<DeliveryOption[]>('/api/order-scheduling/delivery-options', { params }).subscribe({
      next: (options) => {
        this.loadingDates.set(false);
        this.deliveryOptions.set(options);
        this.checkoutForm.controls.requestedDate.setValue(options[0]?.deliveryDate ?? '');
      },
      error: (error) => { this.loadingDates.set(false); this.fail(error); },
    });
  }

  private requireCustomer(): boolean {
    if (this.customerId()) return true;
    this.messages.add({ severity: 'warn', summary: 'Selecciona un cliente', detail: 'El carrito y los precios se habilitan después de elegir el cliente del pedido.' });
    return false;
  }

  private fail(error: unknown): void {
    this.loading.set(false);
    this.messages.add({ severity: 'error', summary: 'Catálogo no disponible', detail: this.error(error) });
  }

  private handleCheckoutError(error: unknown): void {
    this.saving.set(false);
    const message = this.error(error);
    if (error instanceof HttpErrorResponse && error.status === 422 && /cierre.*(finaliz|venc|alcanz)|fecha.*cerr/i.test(message)) {
      this.closedDeliveryDate.set(this.checkoutForm.controls.requestedDate.value);
      this.cutoffDialog.set(true);
      this.loadDeliveryOptions();
      return;
    }
    this.messages.add({ severity: 'error', summary: 'No se pudo crear el pedido', detail: this.error(error) });
  }

  private error(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) return 'Error inesperado';
    const message = error.error?.message;
    return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse';
  }
}
