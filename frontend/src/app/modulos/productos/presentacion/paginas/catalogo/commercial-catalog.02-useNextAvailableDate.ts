import { HttpErrorResponse, HttpParams } from '@angular/common/http';
import { activeCustomerAddresses, CustomerAddress, defaultCustomerAddress, DeliveryOption, DraftCartOrder } from '../../../../../compartido/modelos';
import { CommercialCatalogParte03 } from './commercial-catalog.03-draft-flow';

import { Directive } from '@angular/core';

@Directive()
export abstract class CommercialCatalogParte02 extends CommercialCatalogParte03 {
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
      this.loadActiveDraft();
    }

  protected override loadActiveDraft(): void {
      const customerId = this.customerId();
      if (!customerId) return;
      const storedDraftId = this.cart.draftOrderId();
      this.draftLoading.set(true);
      let params = new HttpParams();
      if (this.auth.user()?.type === 'INTERNO') params = params.set('customerId', customerId);
      this.http.get<DraftCartOrder | null>('/api/pedidos/borrador-carrito', { params }).subscribe({
        next: (draft) => {
          if (this.customerId() !== customerId) return;
          this.draftLoading.set(false);
          if (!draft) {
            if (storedDraftId) {
              this.cart.clear();
              this.prepareCheckout();
            }
            return;
          }
          this.cart.loadDraft(draft.id, draft.code, draft.details);
          const activeAddresses = activeCustomerAddresses(this.currentCustomer());
          const addressId = activeAddresses.some((address) => address.id === draft.addressId)
            ? draft.addressId
            : defaultCustomerAddress(this.currentCustomer())?.id ?? '';
          this.checkoutForm.reset({
            addressId,
            requestedDate: draft.requestedDate,
            observations: draft.observations ?? '',
          });
          this.loadDeliveryOptions();
          this.cartDialog.set(true);
        },
        error: (error) => {
          if (this.customerId() !== customerId) return;
          this.draftLoading.set(false);
          this.fail(error);
        },
      });
    }

  protected override uniqueOptions(options: {label: string; value: string}[]): {label: string; value: string}[] {
      return [...new Map(options.map((option) => [option.value, option])).values()]
        .sort((left, right) => left.label.localeCompare(right.label, 'es'));
    }

  protected override prepareCheckout(): void {
      const address = defaultCustomerAddress(this.currentCustomer());
      this.checkoutForm.reset({ addressId: address?.id ?? '', requestedDate: '', observations: '' });
      this.loadDeliveryOptions();
    }

  protected override currentAddress(): CustomerAddress | undefined {
      return activeCustomerAddresses(this.currentCustomer())
        .find((address) => address.id === this.checkoutForm.controls.addressId.value);
    }

  protected override loadDeliveryOptions(): void {
      const addressId = this.checkoutForm.controls.addressId.value;
      const customerId = this.customerId();
      this.deliveryOptions.set([]);
      if (!addressId || !customerId) return;
      this.loadingDates.set(true);
      let params = new HttpParams().set('addressId', addressId);
      if (this.auth.user()?.type === 'INTERNO') params = params.set('customerId', customerId);
      this.http.get<DeliveryOption[]>('/api/order-scheduling/delivery-options', { params }).subscribe({
        next: (options) => {
          this.loadingDates.set(false);
          this.deliveryOptions.set(options);
          const selectedDate = this.checkoutForm.controls.requestedDate.value;
          const availableDate = options.some((option) => option.deliveryDate === selectedDate)
            ? selectedDate
            : options[0]?.deliveryDate ?? '';
          this.checkoutForm.controls.requestedDate.setValue(availableDate);
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
      this.messages.add({ severity: 'error', summary: 'No se pudo guardar o enviar el pedido', detail: this.error(error) });
    }

  protected override error(error: unknown): string {
      if (!(error instanceof HttpErrorResponse)) return 'Error inesperado';
      const message = error.error?.message;
      return Array.isArray(message) ? message.join('. ') : message || 'La solicitud no pudo completarse';
    }
}
