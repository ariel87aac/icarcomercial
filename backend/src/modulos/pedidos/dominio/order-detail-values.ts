export interface OrderDetailInput {
  quantity: number;
  unitPrice: number;
  subtotal: number;
  productDescription: string;
  presentationDescription: string;
  unitAbbreviation: string;
}

/** Snapshot comercial del detalle antes de comprometer inventario. */
export function orderDetailValues(item: OrderDetailInput) {
  return {
    requestedQuantity: item.quantity.toFixed(3),
    reservedQuantity: '0.000',
    pendingQuantity: '0.000',
    unitPrice: item.unitPrice.toFixed(2),
    subtotal: item.subtotal.toFixed(2),
    productDescriptionSnapshot: item.productDescription,
    presentationDescriptionSnapshot: item.presentationDescription,
    unitAbbreviationSnapshot: item.unitAbbreviation,
  };
}
