import type { CustomerType, OrderOrigin, OrderStatus, PublicTrackingStatus } from '../../../compartido/modelos-base';
import type { Customer, CustomerAddress } from '../../clientes/dominio/modelos-clientes';
import type { ProductPresentation } from '../../productos/dominio/modelos-productos';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface CartItem {
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

export interface OrderScheduleSettings {
  id: number;
  orderCutoffTime: string;
  orderCutoffLeadDays: number;
  consolidationDeadlineTime: string;
  preparationLeadDays: number;
  updatedAt: string;
  updatedBy?: Pick<User, 'id' | 'name'> | null;
}

export interface DeliveryOption {
  deliveryDate: string;
  weekday: number;
  orderCutoffAt: string;
  preparationAt: string;
  zoneId: string;
  zoneName: string;
}

export interface OrderDetail {
  coveredQuantity?: string;
  shortageQuantity?: string;
  availability?: string;
  id: string;
  orderId: string;
  presentationId: string;
  presentation: ProductPresentation;
  requestedQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  unitPrice: string;
  subtotal: string;
  productDescriptionSnapshot: string;
  presentationDescriptionSnapshot: string;
  unitAbbreviationSnapshot: string;
  order?: Order;
}

export interface OrderHistory {
  id: string;
  orderId: string;
  previousStatus: OrderStatus | null;
  newStatus: OrderStatus;
  user: Pick<User, 'id' | 'name' | 'email'> | null;
  origin: OrderOrigin;
  observation: string | null;
  occurredAt: string;
}

export interface Order {
  operationalStatus?: PublicTrackingStatus;
  id: string;
  code: string;
  customerId: string;
  customer: Customer;
  addressId: string;
  address: CustomerAddress;
  requestedDate: string;
  orderCutoffAt: string;
  preparationAt: string;
  status: OrderStatus;
  origin: OrderOrigin;
  observations: string | null;
  total: string;
  createdBy: Pick<User, 'id' | 'name'>;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  canceledBy: Pick<User, 'id' | 'name'> | null;
  receivedAt: string | null;
  confirmedAt: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  customerNameSnapshot: string | null;
  customerTypeSnapshot: CustomerType | null;
  addressSnapshot: string | null;
  zoneSnapshot: string | null;
  distributionWeekdaySnapshot: number | null;
  details: OrderDetail[];
  detailCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicOrderConfirmation {
  trackingUrl?: string;
  orderReference: string;
  customerName: string;
  requestedDate: string;
  orderCutoffAt: string;
  status: OrderStatus;
  total: string;
  canConfirm: boolean;
  details: Array<{
    product: string;
    presentation: string;
    unit: string;
    quantity: string;
    subtotal: string;
  }>;
}
