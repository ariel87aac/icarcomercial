export type RecordStatus = 'ACTIVO' | 'INACTIVO';
export type CustomerType = 'MINORISTA' | 'DISTRIBUIDOR' | 'MAYORISTA';
export type PaymentCondition = 'CONTADO' | 'CREDITO';
export type UserType = 'INTERNO' | 'CLIENTE';
export type OrderStatus = 'BORRADOR' | 'RECIBIDO' | 'CONFIRMADO';
export type OrderOrigin = 'PORTAL' | 'INTERNO';
export type InventoryMovementType = 'INGRESO' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'SALIDA_DESPACHO' | 'ENTRADA_DEVOLUCION';
export type ProductionConsolidationStatus = 'BORRADOR' | 'EMITIDA' | 'EN_PROCESO' | 'CERRADA';
export type ProductionConsolidationType = 'PRINCIPAL' | 'COMPLEMENTARIA';
export type PreparationStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'OBSERVADA' | 'PREPARADA' | 'ASIGNADA' | 'DESPACHADA';
export type DistributionRouteStatus = 'BORRADOR' | 'PLANIFICADA' | 'EN_REPARTO' | 'FINALIZADA' | 'LIQUIDADA';
export type VisitResultType = 'ENTREGADA' | 'ENTREGA_PARCIAL' | 'NO_ENTREGADA';

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
  imageUrl: string | null;
  imageMime: string | null;
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
  imageUrl: string | null;
  category: ProductCategory;
  productLine: ProductLine;
  baseUnit: UnitMeasure;
  presentations: CommercialCatalogPresentation[];
}

export interface CartItem {
  productId: string;
  productCode: string;
  productName: string;
  imageUrl: string | null;
  presentationId: string;
  presentationDescription: string;
  unitAbbreviation: string;
  unitPrice: number;
  quantity: number;
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
  status: 'ACTIVA' | 'CONSUMIDA';
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

export interface Vehicle {
  id: string;
  plate: string;
  description: string;
  referenceCapacity: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationHistory {
  id: string;
  preparationId: string;
  previousStatus: PreparationStatus | null;
  newStatus: PreparationStatus;
  event: 'INICIO' | 'AVANCE' | 'OBSERVACION' | 'CONFIRMACION' | 'ASIGNACION' | 'DESPACHO';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface OrderPreparationDetail {
  id: string;
  preparationId: string;
  orderDetailId: string;
  orderDetail: OrderDetail;
  reservationId: string | null;
  reservation: InventoryReservation | null;
  stockId: string;
  stock: Stock;
  requestedQuantity: string;
  reservedQuantity: string;
  availableSnapshot: string;
  preparedQuantity: string;
  difference: string;
  observation: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
}

export interface OrderPreparation {
  id: string;
  orderId: string;
  order: Order;
  responsibleId: string;
  responsible: Pick<User, 'id' | 'name' | 'email'>;
  status: PreparationStatus;
  version: number;
  productionReferences: string[];
  startedAt: string;
  confirmedBy: Pick<User, 'id' | 'name'> | null;
  confirmedAt: string | null;
  details: OrderPreparationDetail[];
  history: PreparationHistory[];
  detailCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface EligibleOrder extends Order {
  details: Array<OrderDetail & { reservation: InventoryReservation | null; availableQuantity: string }>;
}

export interface RouteResponsible {
  id: string;
  routeId: string;
  userId: string;
  user: User;
  function: 'PRINCIPAL' | 'APOYO';
  isPrincipal: boolean;
}

export interface VisitResultDetail {
  id: string;
  visitResultId: string;
  preparationDetailId: string;
  preparationDetail: OrderPreparationDetail;
  deliveredQuantity: string;
  returnedQuantity: string;
  acceptedReturnQuantity: string;
}

export interface VisitResult {
  id: string;
  routeDeliveryId: string;
  result: VisitResultType;
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
  details: VisitResultDetail[];
}

export interface RouteDelivery {
  id: string;
  routeId: string;
  preparationId: string;
  preparation: OrderPreparation;
  orderId: string;
  order: Order;
  addressId: string;
  address: CustomerAddress;
  position: number | null;
  status: 'PENDIENTE' | 'VISITADA';
  result: VisitResult | null;
}

export interface RouteHistory {
  id: string;
  routeId: string;
  previousStatus: DistributionRouteStatus | null;
  newStatus: DistributionRouteStatus;
  event: 'CREACION' | 'ASIGNACION' | 'SECUENCIA' | 'PLANIFICACION' | 'SALIDA' | 'VISITA' | 'FINALIZACION' | 'LIQUIDACION';
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface RouteSettlement {
  id: string;
  routeId: string;
  completeDeliveries: number;
  partialDeliveries: number;
  notDelivered: number;
  acceptedReturnQuantity: string;
  observation: string | null;
  occurredAt: string;
}

export interface DistributionRoute {
  id: string;
  code: string;
  date: string;
  zoneId: string;
  zone: Zone;
  vehicleId: string;
  vehicle: Vehicle;
  status: DistributionRouteStatus;
  createdBy: Pick<User, 'id' | 'name'>;
  observation: string | null;
  departedAt: string | null;
  finishedAt: string | null;
  settledAt: string | null;
  version: number;
  responsibles: RouteResponsible[];
  deliveries: RouteDelivery[];
  history: RouteHistory[];
  deliveryCount?: number;
  metrics?: {
    total: number;
    complete: number;
    partial: number;
    notDelivered: number;
    returnedQuantity: string;
    acceptedReturnQuantity: string;
  };
  settlement?: RouteSettlement | null;
  createdAt: string;
  updatedAt: string;
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
