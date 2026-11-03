import type { ProductPresentationView } from './product-presentation.view';
import type { OrderView } from './order.view';

export interface OrderDetailView {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  orderId: string;
  order: OrderView;
  presentationId: string;
  presentation: ProductPresentationView;
  requestedQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  unitPrice: string;
  subtotal: string;
  productDescriptionSnapshot: string;
  presentationDescriptionSnapshot: string;
  unitAbbreviationSnapshot: string;
}
