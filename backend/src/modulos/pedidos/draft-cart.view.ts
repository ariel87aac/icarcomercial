import { Order } from './entidades/order.entity';

export interface DraftCartView {
  id: string;
  code: string;
  customerId: string;
  addressId: string;
  requestedDate: string;
  orderCutoffAt: Date;
  preparationAt: Date;
  observations: string | null;
  total: string;
  updatedAt: Date;
  details: DraftCartItemView[];
}

export interface DraftCartItemView {
  productId: string;
  productCode: number;
  productName: string;
  imageUrl: string | null;
  presentationId: string;
  presentationDescription: string;
  unitAbbreviation: string;
  unitPrice: number;
  quantity: number;
}

export function toDraftCartView(order: Order): DraftCartView {
  return {
    id: order.id,
    code: order.code,
    customerId: order.customerId,
    addressId: order.addressId,
    requestedDate: order.requestedDate,
    orderCutoffAt: order.orderCutoffAt,
    preparationAt: order.preparationAt,
    observations: order.observations,
    total: order.total,
    updatedAt: order.updatedAt,
    details: order.details.map((detail) => ({
      productId: detail.presentation.product.id,
      productCode: detail.presentation.product.code,
      productName: detail.productDescriptionSnapshot,
      imageUrl: detail.presentation.product.imageMime
        ? `/api/catalogo/productos/${detail.presentation.product.id}/imagen?v=${detail.presentation.product.updatedAt.getTime()}`
        : null,
      presentationId: detail.presentationId,
      presentationDescription: detail.presentationDescriptionSnapshot,
      unitAbbreviation: detail.unitAbbreviationSnapshot,
      unitPrice: Number(detail.unitPrice),
      quantity: Number(detail.requestedQuantity),
    })),
  };
}
