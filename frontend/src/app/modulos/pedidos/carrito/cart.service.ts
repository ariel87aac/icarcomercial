import { Injectable, computed, signal } from '@angular/core';
import { CartItem, CommercialCatalogPresentation, CommercialCatalogProduct } from '../../../compartido/modelos';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storagePrefix = 'icar-shopping-cart-v2';
  private readonly scope = signal('');
  readonly items = signal<CartItem[]>([]);
  readonly draftOrderId = signal<string | null>(null);
  readonly draftOrderCode = signal<string | null>(null);
  readonly itemCount = computed(() => this.items().reduce((total, item) => total + item.quantity, 0));
  readonly total = computed(() => this.items().reduce((total, item) => total + item.unitPrice * item.quantity, 0));

  useScope(userId: string, customerId: string): void {
    const nextScope = `${userId}:${customerId}`;
    if (nextScope === this.scope()) return;
    this.scope.set(nextScope);
    const stored = this.read(nextScope);
    this.items.set(stored.items);
    this.draftOrderId.set(stored.draftOrderId);
    this.draftOrderCode.set(stored.draftOrderCode);
  }

  loadDraft(orderId: string, orderCode: string, items: CartItem[]): void {
    this.draftOrderId.set(orderId);
    this.draftOrderCode.set(orderCode);
    this.update(items);
  }

  add(product: CommercialCatalogProduct, presentation: CommercialCatalogPresentation, quantity: number): void {
    if (!presentation.price || quantity <= 0) return;
    const items = [...this.items()];
    const existing = items.find((item) => item.presentationId === presentation.id);
    if (existing) existing.quantity = this.roundQuantity(existing.quantity + quantity);
    else items.push({
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      imageUrl: product.imageUrl,
      presentationId: presentation.id,
      presentationDescription: presentation.description,
      unitAbbreviation: presentation.unit.abbreviation,
      unitPrice: Number(presentation.price.amount),
      quantity: this.roundQuantity(quantity),
    });
    this.update(items);
  }

  changeQuantity(presentationId: string, quantity: number | null): void {
    if (!quantity || quantity <= 0) return this.remove(presentationId);
    this.update(this.items().map((item) => item.presentationId === presentationId
      ? { ...item, quantity: this.roundQuantity(quantity) }
      : item));
  }

  remove(presentationId: string): void {
    this.update(this.items().filter((item) => item.presentationId !== presentationId));
  }

  clear(): void {
    this.draftOrderId.set(null);
    this.draftOrderCode.set(null);
    this.update([]);
  }

  private update(items: CartItem[]): void {
    this.items.set(items);
    const scope = this.scope();
    if (!scope) return;
    try {
      localStorage.setItem(`${this.storagePrefix}:${scope}`, JSON.stringify({
        items,
        draftOrderId: this.draftOrderId(),
        draftOrderCode: this.draftOrderCode(),
      }));
    } catch { /* almacenamiento no disponible */ }
  }

  private read(scope: string): { items: CartItem[]; draftOrderId: string | null; draftOrderCode: string | null } {
    try {
      const value = JSON.parse(localStorage.getItem(`${this.storagePrefix}:${scope}`) ?? '{}');
      const items = Array.isArray(value?.items) ? value.items.filter((item: unknown): item is CartItem => {
        const candidate = item as Partial<CartItem> | null;
        return Boolean(candidate && typeof candidate.presentationId === 'string'
          && typeof candidate.productName === 'string' && Number.isFinite(candidate.unitPrice)
          && Number.isFinite(candidate.quantity) && Number(candidate.quantity) > 0);
      }) : [];
      return {
        items,
        draftOrderId: typeof value?.draftOrderId === 'string' ? value.draftOrderId : null,
        draftOrderCode: typeof value?.draftOrderCode === 'string' ? value.draftOrderCode : null,
      };
    } catch { return { items: [], draftOrderId: null, draftOrderCode: null }; }
  }

  private roundQuantity(value: number): number { return Math.round(value * 1000) / 1000; }
}
