import { describe, expect, it } from 'vitest';
import { Order } from './entidades/order.entity';
import { toDraftCartView } from './draft-cart.view';

describe('vista del carrito borrador', () => {
  it('reconstruye los productos y cantidades guardadas en el pedido', () => {
    const productUpdatedAt = new Date('2026-10-30T10:00:00.000Z');
    const order = {
      id: 'order-1',
      code: '12',
      customerId: 'customer-1',
      addressId: 'address-1',
      requestedDate: '2026-11-02',
      orderCutoffAt: new Date('2026-11-01T17:00:00.000Z'),
      preparationAt: new Date('2026-11-01T22:00:00.000Z'),
      observations: 'Entregar por la mañana',
      total: '36.00',
      updatedAt: new Date('2026-10-30T11:00:00.000Z'),
      details: [{
        presentationId: 'presentation-1',
        requestedQuantity: '3.000',
        unitPrice: '12.00',
        productDescriptionSnapshot: 'Croissant',
        presentationDescriptionSnapshot: 'Bolsa de 6 unidades',
        unitAbbreviationSnapshot: 'BOL',
        presentation: {
          product: {
            id: 'product-1',
            code: 101,
            imageMime: 'image/png',
            updatedAt: productUpdatedAt,
          },
        },
      }],
    } as unknown as Order;

    const result = toDraftCartView(order);

    expect(result.code).toBe('12');
    expect(result.details).toEqual([expect.objectContaining({
      productCode: 101,
      productName: 'Croissant',
      quantity: 3,
      unitPrice: 12,
      imageUrl: `/api/catalogo/productos/product-1/imagen?v=${productUpdatedAt.getTime()}`,
    })]);
  });
});
