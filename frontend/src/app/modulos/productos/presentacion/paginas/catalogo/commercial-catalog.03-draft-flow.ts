import { Directive } from '@angular/core';
import { Observable, finalize, switchMap } from 'rxjs';
import { Order } from '../../../../../compartido/modelos';
import { CommercialCatalogBase } from './commercial-catalog.base';

@Directive()
export abstract class CommercialCatalogParte03 extends CommercialCatalogBase {
  protected override closeCart(): void {
    const customerId = this.customerId();
    this.cartDialog.set(false);
    const request = this.draftRequest();
    if (!request || !customerId) return;
    this.saving.set(true);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (order) => {
        if (this.customerId() === customerId) {
          this.cart.loadDraft(order.id, order.code, this.cart.items());
        }
      },
      error: (error) => this.handleCheckoutError(error),
    });
  }

  protected override changeCartVisibility(visible: boolean): void {
    if (visible) this.cartDialog.set(true);
    else this.closeCart();
  }

  protected override checkout(): void {
    const request = this.draftRequest();
    if (!request) {
      this.checkoutForm.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Pedido incompleto',
        detail: 'Selecciona un domicilio, una fecha y agrega al menos un producto.',
      });
      return;
    }
    this.saving.set(true);
    request.pipe(
      switchMap((draft) => {
        this.cart.loadDraft(draft.id, draft.code, this.cart.items());
        return this.http.post<Order>(`/api/pedidos/${draft.id}/enviar`, {
          observation: 'Pedido enviado desde el catálogo',
        });
      }),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: (order) => {
        this.cart.clear();
        this.cartDialog.set(false);
        this.prepareCheckout();
        this.messages.add({
          severity: 'success',
          summary: 'Pedido enviado',
          detail: `${order.code} fue enviado al cliente con su enlace de aprobación.`,
        });
      },
      error: (error) => this.handleCheckoutError(error),
    });
  }

  private draftRequest(): Observable<Order> | null {
    if (this.checkoutForm.invalid || !this.cart.items().length || !this.customerId()) return null;
    const raw = this.checkoutForm.getRawValue();
    const details = this.cart.items().map((item) => ({
      presentationId: item.presentationId,
      quantity: item.quantity,
    }));
    const draftId = this.cart.draftOrderId();
    if (draftId && !this.auth.can('orders.update')) return null;
    if (!draftId && !this.auth.can('orders.create')) return null;
    if (draftId) {
      return this.http.patch<Order>(`/api/pedidos/${draftId}`, {
        addressId: raw.addressId,
        requestedDate: raw.requestedDate,
        observations: raw.observations.trim() || undefined,
        details,
      });
    }
    return this.http.post<Order>('/api/pedidos', {
      ...(this.auth.user()?.type === 'INTERNO' ? { customerId: this.customerId()! } : {}),
      addressId: raw.addressId,
      requestedDate: raw.requestedDate,
      observations: raw.observations.trim() || undefined,
      details,
    });
  }
}
