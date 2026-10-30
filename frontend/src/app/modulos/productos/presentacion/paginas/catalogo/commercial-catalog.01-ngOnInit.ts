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
import { AuthService } from '../../../../../nucleo/autenticacion/auth.service';
import { CartService } from '../../../../pedidos/carrito/cart.service';
import {
  CommercialCatalogPresentation,
  CommercialCatalogProduct,
  Customer,
  CustomerAddress,
  DeliveryOption,
  OrderScheduleSettings,
  Paginated,
} from '../../../../../compartido/modelos';
import { CommercialCatalogParte02 } from './commercial-catalog.02-useNextAvailableDate';

import { Directive } from '@angular/core';

@Directive()
export abstract class CommercialCatalogParte01 extends CommercialCatalogParte02 {
  override ngOnInit(): void {
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

  protected override changeCustomer(id: string | null, picker?: { writeValue(value: string | null): void }): void {
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

  protected override categoryOptions(): {label: string; value: string}[] {
      return this.uniqueOptions(this.products().map((product) => ({ label: product.category.name, value: product.category.id })));
    }

  protected override lineOptions(): {label: string; value: string}[] {
      return this.uniqueOptions(this.products()
        .filter((product) => !this.categoryId() || product.category.id === this.categoryId())
        .map((product) => ({ label: product.productLine.name, value: product.productLine.id })));
    }

  protected override productOptions(): {label: string; value: string}[] {
      return this.products()
        .filter((product) => (!this.categoryId() || product.category.id === this.categoryId())
          && (!this.productLineId() || product.productLine.id === this.productLineId()))
        .map((product) => ({ label: `${product.name} · ${product.code}`, value: product.id }));
    }

  protected override filteredProducts(): CommercialCatalogProduct[] {
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

  protected override changeCategory(id: string | null): void {
      this.categoryId.set(id);
      this.productLineId.set(null);
      this.productId.set(null);
    }

  protected override changeLine(id: string | null): void {
      this.productLineId.set(id);
      this.productId.set(null);
    }

  protected override clearFilters(): void {
      this.search.set('');
      this.categoryId.set(null);
      this.productLineId.set(null);
      this.productId.set(null);
    }

  protected override load(): void {
      this.loading.set(true);
      let params = new HttpParams().set('limit', 100);
      if (this.search().trim()) params = params.set('q', this.search().trim());
      if (this.customerId()) params = params.set('customerId', this.customerId()!);
      this.http.get<Paginated<CommercialCatalogProduct>>('/api/catalogo', { params }).subscribe({
        next: (response) => { this.products.set(response.data); this.loading.set(false); },
        error: (error) => this.fail(error),
      });
    }

  protected override currentCustomer(): Customer | undefined { return this.customers().find((customer) => customer.id === this.customerId()); }

  protected override lowestPrice(product: CommercialCatalogProduct): number | null {
      const prices = product.presentations.flatMap((presentation) => presentation.price ? [Number(presentation.price.amount)] : []);
      return prices.length ? Math.min(...prices) : null;
    }

  protected override money(value: number): string { return value.toFixed(2); }

  protected override pricedPresentations(product: CommercialCatalogProduct): {label: string; value: string}[] {
      return product.presentations.filter((presentation) => presentation.price).map((presentation) => ({
        label: `${presentation.description} · ${presentation.unit.abbreviation} · Bs ${presentation.price!.amount}`,
        value: presentation.id,
      }));
    }

  protected override selectedPresentation(product: CommercialCatalogProduct): CommercialCatalogPresentation | undefined {
      return product.presentations.find((presentation) => presentation.id === this.selectedPresentationId() && presentation.price);
    }

  protected override openProduct(product: CommercialCatalogProduct): void {
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

  protected override quickAdd(product: CommercialCatalogProduct, presentation: CommercialCatalogPresentation, event: Event): void {
      event.stopPropagation();
      if (!this.requireCustomer()) return;
      this.cart.add(product, presentation, 1);
      this.cartDialog.set(true);
      this.messages.add({ severity: 'success', summary: 'Producto agregado', detail: `${product.name} · ${presentation.description}` });
    }

  protected override addSelected(): void {
      if (!this.requireCustomer()) return;
      const product = this.selectedProduct();
      const presentation = product ? this.selectedPresentation(product) : undefined;
      if (!product || !presentation || this.productQuantity() <= 0) return;
      this.cart.add(product, presentation, this.productQuantity());
      this.productDialog.set(false);
      this.cartDialog.set(true);
      this.messages.add({ severity: 'success', summary: 'Producto agregado', detail: `${product.name} · ${presentation.description}` });
    }

  protected override openCart(): void {
      if (!this.requireCustomer()) return;
      if (!this.checkoutForm.controls.addressId.value) this.prepareCheckout();
      this.cartDialog.set(true);
    }

  protected override addressOptions(): {label: string; value: string}[] {
      return (this.currentCustomer()?.addresses ?? []).filter((address) => address.status === 'ACTIVO').map((address) => ({
        label: `${address.label} · ${address.address}`,
        value: address.id,
      }));
    }

  protected override onAddressChange(): void {
      this.loadDeliveryOptions();
    }

  protected override deliveryOptionItems(): {label: string; value: string}[] {
      return this.deliveryOptions().map((option) => ({
        label: `${this.formatDate(option.deliveryDate)} · cierre ${this.formatDateTime(option.orderCutoffAt)}`,
        value: option.deliveryDate,
      }));
    }

  protected override currentDeliveryOption(): DeliveryOption | undefined {
      return this.deliveryOptions().find((option) => option.deliveryDate === this.checkoutForm.controls.requestedDate.value);
    }

  protected override formatDate(value: string): string {
      return new Intl.DateTimeFormat('es-BO', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
        .format(new Date(`${value}T12:00:00.000Z`));
    }

  protected override formatDateTime(value: string): string {
      return new Intl.DateTimeFormat('es-BO', { timeZone: 'America/La_Paz', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        .format(new Date(value));
    }

  protected override openScheduleSettings(): void {
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

  protected override saveScheduleSettings(): void {
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

  protected override checkout(): void {
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
}
