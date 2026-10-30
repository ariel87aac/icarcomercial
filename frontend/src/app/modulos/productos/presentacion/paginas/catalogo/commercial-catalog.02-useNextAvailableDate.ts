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
import { CommercialCatalogBase } from './commercial-catalog.base';

import { Directive } from '@angular/core';

@Directive()
export abstract class CommercialCatalogParte02 extends CommercialCatalogBase {
  protected override useNextAvailableDate(): void {
      const option = this.currentDeliveryOption();
      if (!option) return;
      this.cutoffDialog.set(false);
      this.messages.add({ severity: 'info', summary: 'Pedido preparado para la siguiente fecha', detail: `Entrega: ${this.formatDate(option.deliveryDate)}. Revisa el resumen y vuelve a crear el pedido.` });
    }

  protected override cancelClosedCart(): void {
      this.cart.clear();
      this.cutoffDialog.set(false);
      this.cartDialog.set(false);
      this.closedDeliveryDate.set('');
      this.prepareCheckout();
      this.messages.add({ severity: 'info', summary: 'Pedido cancelado', detail: 'Se eliminaron los productos del carrito.' });
    }

  protected override activateCustomer(id: string): void {
      this.customerId.set(id);
      const userId = this.auth.user()?.id;
      if (userId) this.cart.useScope(userId, id);
      this.prepareCheckout();
      this.clearFilters();
      this.load();
    }

  protected override uniqueOptions(options: {label: string; value: string}[]): {label: string; value: string}[] {
      return [...new Map(options.map((option) => [option.value, option])).values()]
        .sort((left, right) => left.label.localeCompare(right.label, 'es'));
    }

  protected override prepareCheckout(): void {
      const address = this.currentCustomer()?.addresses.find((item) => item.status === 'ACTIVO');
      this.checkoutForm.reset({ addressId: address?.id ?? '', requestedDate: '', observations: '' });
      this.loadDeliveryOptions();
    }

  protected override currentAddress(): CustomerAddress | undefined {
      return this.currentCustomer()?.addresses.find((address) => address.id === this.checkoutForm.controls.addressId.value);
    }

  protected override loadDeliveryOptions(): void {
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

  protected override requireCustomer(): boolean {
      if (this.customerId()) return true;
      this.messages.add({ severity: 'warn', summary: 'Selecciona un cliente', detail: 'El carrito y los precios se habilitan después de elegir el cliente del pedido.' });
      return false;
    }

  protected override fail(error: unknown): void {
      this.loading.set(false);
      this.messages.add({ severity: 'error', summary: 'Catálogo no disponible', detail: this.error(error) });
    }

  protected override handleCheckoutError(error: unknown): void {
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

  protected override error(error: unknown): string {
      if (!(error instanceof HttpErrorResponse)) return 'Error inesperado';
      const message = error.error?.message;
      return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse';
    }
}
