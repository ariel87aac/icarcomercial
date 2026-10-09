import { Injectable, computed, signal } from '@angular/core';
import { CartItem, CommercialCatalogPresentation, CommercialCatalogProduct } from './models';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly storagePrefix = 'icar-shopping-cart-v1';
  private readonly scope = signal('');
  readonly items = signal<CartItem[]>([]);
  readonly itemCount = computed(() => this.items().reduce((total, item) => total + item.quantity, 0));
  readonly total = computed(() => this.items().reduce((total, item) => total + item.unitPrice * item.quantity, 0));

  useScope(userId: string, customerId: string): void {
    const nextScope = `${userId}:${customerId}`;
    if (nextScope === this.scope()) return;
    this.scope.set(nextScope);
    this.items.set(this.read(nextScope));
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

  clear(): void { this.update([]); }

  private update(items: CartItem[]): void {
    this.items.set(items);
    const scope = this.scope();
    if (!scope) return;
    try { localStorage.setItem(`${this.storagePrefix}:${scope}`, JSON.stringify(items)); } catch { /* almacenamiento no disponible */ }
  }

  private read(scope: string): CartItem[] {
    try {
      const value = JSON.parse(localStorage.getItem(`${this.storagePrefix}:${scope}`) ?? '[]');
      if (!Array.isArray(value)) return [];
      return value.filter((item): item is CartItem => Boolean(
        item && typeof item.presentationId === 'string' && typeof item.productName === 'string'
        && Number.isFinite(item.unitPrice) && Number.isFinite(item.quantity) && item.quantity > 0,
      ));
    } catch { return []; }
  }

  private roundQuantity(value: number): number { return Math.round(value * 1000) / 1000; }
}
