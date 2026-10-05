export type RecordStatus = 'ACTIVO' | 'INACTIVO';
export type CustomerType = 'MINORISTA' | 'DISTRIBUIDOR' | 'MAYORISTA';
export type PaymentCondition = 'CONTADO' | 'CREDITO';
export type UserType = 'INTERNO' | 'CLIENTE';
export type OrderStatus = 'BORRADOR' | 'RECIBIDO' | 'CONFIRMADO';
export type OrderOrigin = 'PORTAL' | 'INTERNO';
export type InventoryMovementType = 'INGRESO' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO';
export type ProductionConsolidationStatus = 'BORRADOR' | 'EMITIDA' | 'EN_PROCESO' | 'CERRADA';
export type ProductionConsolidationType = 'PRINCIPAL' | 'COMPLEMENTARIA';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  type: UserType;
  customerId: string | null;
  roles: string[];
  permissions: string[];
  productLineIds: string[];
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  isSystem: boolean;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  type: UserType;
  status: RecordStatus;
  lastLoginAt: string | null;
  roles: Role[];
  productLines: ProductLine[];
}

export interface CustomerAccount {
  customerId: string;
  userId: string;
  isPrimary: boolean;
  status: RecordStatus;
  createdAt: string;
  user: Pick<
    User,
    'id' | 'name' | 'username' | 'email' | 'phone' | 'type' | 'status'
  >;
}

export interface DistributionDay {
  id: string;
  zoneId: string;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  status: RecordStatus;
}

export interface Zone {
  id: string;
  name: string;
  description: string | null;
  status: RecordStatus;
  distributionDays: DistributionDay[];
}

export interface CustomerAddress {
  id: string;
  customerId: string;
  zoneId: string | null;
  zone: Zone | null;
  distributionDayId: string | null;
  distributionDay: DistributionDay | null;
  label: string;
  address: string;
  reference: string | null;
  latitude: string | null;
  longitude: string | null;
  isPrimary: boolean;
  status: RecordStatus;
}

export interface Customer {
  id: string;
  type: CustomerType;
  businessName: string;
  taxId: string | null;
  contactName: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  paymentCondition: PaymentCondition;
  commercialList: string | null;
  creditLimit: string;
  creditDays: number;
  status: RecordStatus;
  addresses: CustomerAddress[];
  userLinks: CustomerAccount[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  status: RecordStatus;
}

export interface ProductLine {
  id: string;
  name: string;
  status: RecordStatus;
}

export interface UnitMeasure {
  id: string;
  name: string;
  abbreviation: string;
  decimalScale: number;
  status: RecordStatus;
}

export interface ProductPresentation {
  id: string;
  productId: string;
  unitId: string;
  unit: UnitMeasure;
  description: string;
  conversionFactor: string;
  status: RecordStatus;
  product?: Product;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  category: ProductCategory;
  productLineId: string;
  productLine: ProductLine;
  baseUnitId: string;
  baseUnit: UnitMeasure;
  status: RecordStatus;
  presentations: ProductPresentation[];
}

export interface ProductPrice {
  id: string;
  presentationId: string;
  presentation?: ProductPresentation;
  customerType: CustomerType | null;
  commercialList: string | null;
  amount: string;
  validFrom: string;
  validUntil: string | null;
  status: RecordStatus;
}

export interface CommercialCatalogPresentation {
  id: string;
  description: string;
  conversionFactor: string;
  unit: UnitMeasure;
  price: ProductPrice | null;
}

export interface CommercialCatalogProduct {
  id: string;
  code: string;
  name: string;
  category: ProductCategory;
  productLine: ProductLine;
  baseUnit: UnitMeasure;
  presentations: CommercialCatalogPresentation[];
}

export interface Stock {
  id: string;
  presentationId: string;
  presentation: ProductPresentation;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  version: number;
}

export interface InventoryMovement {
  id: string;
  stockId: string;
  stock: Stock;
  type: InventoryMovementType;
  quantity: string;
  previousBalance: string;
  newBalance: string;
  reason: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'email'>;
  occurredAt: string;
}

export interface InventoryReservation {
  id: string;
  orderDetailId: string;
  stockId: string;
  stock: Stock;
  orderDetail: OrderDetail;
  quantity: string;
  status: 'ACTIVA';
  user: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface OrderDetail {
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
  user: Pick<User, 'id' | 'name' | 'email'>;
  origin: OrderOrigin;
  observation: string | null;
  occurredAt: string;
}

export interface Order {
  id: string;
  code: string;
  customerId: string;
  customer: Customer;
  addressId: string;
  address: CustomerAddress;
  requestedDate: string;
  status: OrderStatus;
  origin: OrderOrigin;
  observations: string | null;
  total: string;
  createdBy: Pick<User, 'id' | 'name'>;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  receivedAt: string | null;
  confirmedAt: string | null;
  customerNameSnapshot: string | null;
  customerTypeSnapshot: CustomerType | null;
  commercialListSnapshot: string | null;
  addressSnapshot: string | null;
  zoneSnapshot: string | null;
  distributionWeekdaySnapshot: number | null;
  details: OrderDetail[];
  detailCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionConsolidationSource {
  id: string;
  consolidatedDetailId: string;
  orderDetailId: string;
  presentationId: string;
  presentation: ProductPresentation;
  originalQuantity: string;
  appliedFactor: string;
  baseContribution: string;
  orderDetail: OrderDetail & { order: Order };
  createdAt: string;
}

export interface ProductionProgress {
  id: string;
  consolidatedDetailId: string;
  quantity: string;
  type: 'AVANCE';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
}

export interface ProductionConsolidationDetail {
  id: string;
  consolidationId: string;
  productId: string;
  product: Product;
  productLineId: string;
  productLine: ProductLine;
  baseUnitId: string;
  baseUnit: UnitMeasure;
  requestedQuantity: string;
  preparedQuantity: string;
  difference: string;
  sources: ProductionConsolidationSource[];
  progress: ProductionProgress[];
}

export interface ProductionConsolidation {
  id: string;
  deliveryDate: string;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  generatedBy: Pick<User, 'id' | 'name' | 'email'>;
  emittedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  emittedAt: string | null;
  closedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  closedAt: string | null;
  details: ProductionConsolidationDetail[];
  detailCount?: number;
  createdAt: string;
}

export interface ProductionHistory {
  id: string;
  consolidationId: string;
  previousStatus: ProductionConsolidationStatus | null;
  newStatus: ProductionConsolidationStatus;
  event: 'GENERACION' | 'RECALCULO' | 'EMISION' | 'INICIO' | 'AVANCE' | 'CIERRE';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
}

export interface ProductionSummaryRow {
  deliveryDate: string;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  productLineId: string;
  productLineName: string;
  productId: string;
  productName: string;
  baseUnitId: string;
  baseUnitAbbreviation: string;
  requestedQuantity: string;
  preparedQuantity: string;
  pendingQuantity: string;
  difference: string;
}

export interface AuditEvent {
  id: string;
  userId: string | null;
  user: Pick<User, 'id' | 'name' | 'email'> | null;
  module: string;
  action: string;
  entity: string;
  entityId: string | null;
  result: 'EXITOSO' | 'RECHAZADO' | 'ERROR';
  ipAddress: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
