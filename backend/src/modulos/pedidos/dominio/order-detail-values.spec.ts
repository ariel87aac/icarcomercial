import { describe, expect, it } from 'vitest';
import { orderDetailValues } from './order-detail-values';

describe('snapshot comercial de un detalle de pedido', () => {
  it('conserva precisión monetaria y cantidades sin reservar stock en el borrador', () => {
    const detail = orderDetailValues({
      quantity: 1.25,
      unitPrice: 12.5,
      subtotal: 15.625,
      productDescription: 'Producto original',
      presentationDescription: 'Bolsa',
      unitAbbreviation: 'kg',
    });

    expect(detail).toEqual({
      requestedQuantity: '1.250',
      reservedQuantity: '0.000',
      pendingQuantity: '0.000',
      unitPrice: '12.50',
      subtotal: '15.63',
      productDescriptionSnapshot: 'Producto original',
      presentationDescriptionSnapshot: 'Bolsa',
      unitAbbreviationSnapshot: 'kg',
    });
  });
});
