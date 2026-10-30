export type RecordStatus = 'ACTIVO' | 'INACTIVO';
export type CustomerType = 'PUBLICO' | 'MINORISTA' | 'DISTRIBUIDOR' | 'MAYORISTA';
export type PaymentCondition = 'CONTADO' | 'CREDITO';
export type UserType = 'INTERNO' | 'CLIENTE';
export type OrderStatus = 'BORRADOR' | 'RECIBIDO' | 'CONFIRMADO' | 'CANCELADO';
export type OrderOrigin = 'PORTAL' | 'INTERNO';
export type InventoryMovementType = 'INGRESO' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'SALIDA_DESPACHO' | 'ENTRADA_DEVOLUCION' | 'INGRESO_PRODUCCION';
export type StockReplenishmentRequestStatus = 'BORRADOR' | 'ENVIADA' | 'PROGRAMADA' | 'CERRADA' | 'CERRADA_INCOMPLETA';
export type ProductionConsolidationStatus = 'BORRADOR' | 'EMITIDA' | 'EN_PROCESO' | 'CERRADA' | 'CANCELADA' | 'CERRADA_INCOMPLETA';
export type ProductionConsolidationType = 'PRINCIPAL' | 'COMPLEMENTARIA';
export type ProductionDetailStage = 'PENDIENTE' | 'EN_PROCESO' | 'PENDIENTE_RECEPCION' | 'RECIBIDO_PARCIAL' | 'COMPLETADO' | 'CERRADO_CON_INCIDENCIA' | 'CANCELADO';
export type PreparationStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'OBSERVADA' | 'PREPARADA' | 'ASIGNADA' | 'DESPACHADA' | 'CANCELADA';
export type DistributionRouteStatus = 'BORRADOR' | 'PLANIFICADA' | 'EN_REPARTO' | 'FINALIZADA' | 'LIQUIDADA' | 'CANCELADA';
export type VisitResultType = 'ENTREGADA' | 'ENTREGA_PARCIAL' | 'NO_ENTREGADA';
export type PublicTrackingStatus = 'PEDIDO_CONFIRMADO' | 'EN_PREPARACION' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'ENTREGA_NO_COMPLETADA';
export type NotificationEvent = 'PEDIDO_BORRADOR' | 'PEDIDO_RECIBIDO' | 'PEDIDO_CONFIRMADO' | 'PEDIDO_CANCELADO' | 'CAMBIO_RELEVANTE' | 'SALIDA_RUTA' | 'PROXIMA_ENTREGA' | 'ENTREGADO' | 'ENTREGA_NO_COMPLETADA' | 'PAGO_RECIBIDO';
export type NotificationStatus = 'PENDIENTE' | 'PROCESANDO' | 'ENVIADO' | 'ENTREGADO' | 'REINTENTO' | 'FALLIDO';

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  username: string;
  type: UserType;
  customerId: string | null;
  roles: string[];
  permissions: string[];
  productionAreaIds: string[];
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
  code: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  type: UserType;
  status: RecordStatus;
  lastLoginAt: string | null;
  roles: Role[];
  productionAreas: ProductionArea[];
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
  code: number;
  type: CustomerType;
  businessName: string;
  taxId: string | null;
  contactName: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  paymentCondition: PaymentCondition;
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
  code: number;
  name: string;
  status: RecordStatus;
}

export interface ProductLine {
  id: string;
  code: number;
  name: string;
  status: RecordStatus;
}

export interface UnitMeasure {
  id: string;
  code: number;
  name: string;
  abbreviation: string;
  decimalScale: number;
  kilogramFactor: string | null;
  status: RecordStatus;
}

export interface ProductPresentation {
  id: string;
  productId: string;
  unitId: string;
  unit: UnitMeasure;
  description: string;
  conversionFactor: string;
  weightKg: string | null;
  status: RecordStatus;
  product?: Product;
}

export interface Product {
  id: string;
  code: number;
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
  customerType: CustomerType;
  amount: string;
  validFrom: string;
  validUntil: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PriceMatrixRow {
  presentationId: string;
  productCode: number;
  productName: string;
  categoryId: string;
  categoryName: string;
  presentationDescription: string;
  prices: Record<CustomerType, string | null>;
  lastModifiedAt: string | null;
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
  code: number;
  name: string;
  imageUrl: string | null;
  category: ProductCategory;
  productLine: ProductLine;
  baseUnit: UnitMeasure;
  presentations: CommercialCatalogPresentation[];
}

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

export interface Stock {
  id: string;
  presentationId: string;
  presentation: ProductPresentation;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  shortageQuantity: string;
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
  status: 'ACTIVA' | 'CONSUMIDA' | 'LIBERADA';
  user: Pick<User, 'id' | 'name'>;
  createdAt: string;
}

export interface StockReplenishmentRequestDetail {
  id: string;
  requestId: string;
  presentationId: string;
  presentation: ProductPresentation;
  categoryId: string;
  category: ProductCategory;
  productionAreaId: string | null;
  productionArea: ProductionArea | null;
  physicalQuantitySnapshot: string;
  reservedQuantitySnapshot: string;
  demandQuantitySnapshot: string;
  shortageQuantitySnapshot: string;
  additionalStockQuantity: string;
  observation: string | null;
}

export interface StockReplenishmentRequest {
  id: string;
  code: number;
  requiredDate: string;
  status: StockReplenishmentRequestStatus;
  requestedBy: Pick<User, 'id' | 'name' | 'email'>;
  sentBy: Pick<User, 'id' | 'name' | 'email'> | null;
  sentAt: string | null;
  productionConsolidationId: string | null;
  productionConsolidation: Pick<ProductionConsolidation, 'id' | 'version' | 'status' | 'deliveryDate'> | null;
  scheduledAt: string | null;
  closedAt: string | null;
  closeObservation: string | null;
  closedById: string | null;
  closedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  details: StockReplenishmentRequestDetail[];
  detailCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockReplenishmentPlanItem {
  presentation: ProductPresentation & { product: Product };
  category: ProductCategory;
  productionArea: ProductionArea | null;
  physicalQuantity: string;
  reservedQuantity: string;
  availableQuantity: string;
  demandQuantity: string;
  shortageQuantity: string;
  additionalStockQuantity: string;
  totalProductionQuantity: string;
  observation: string | null;
}

export interface StockReplenishmentPlan {
  request: StockReplenishmentRequest;
  items: StockReplenishmentPlanItem[];
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
  user: Pick<User, 'id' | 'name' | 'email'> | null;
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

export interface TrackingHistoryItem {
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  estimatedFrom: string | null;
  estimatedUntil: string | null;
  occurredAt: string;
}

export interface TrackingSnapshot {
  protectedReference: string;
  status: PublicTrackingStatus;
  pendingPriorStops: number;
  estimatedFrom: string | null;
  estimatedUntil: string | null;
  lastUpdatedAt: string;
  history: TrackingHistoryItem[];
}

export interface TrackingLinkSummary {
  id: string;
  status: 'ACTIVO' | 'EXPIRADO' | 'REVOCADO';
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  createdBy?: Pick<User, 'id' | 'name'>;
}

export interface OrderTrackingResponse {
  link: TrackingLinkSummary | null;
  links?: TrackingLinkSummary[];
  tracking: TrackingSnapshot;
}

export interface PublicOrderConfirmation {
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

export interface EstimationSetting {
  id: string;
  zoneId: string | null;
  zone: Zone | null;
  averageStopMinutes: number;
  toleranceMinutes: number;
  nextDeliveryThreshold: number;
  validFrom: string;
  validUntil: string | null;
  createdBy: Pick<User, 'id' | 'name'>;
}

export interface NotificationTemplate {
  id: string;
  event: NotificationEvent;
  reference: string;
  version: number;
  body: string;
  allowedVariables: string[];
  active: boolean;
  createdAt: string;
  createdBy: Pick<User, 'id' | 'name'>;
}

export interface ChannelSetting {
  id: string;
  provider: 'LIMITEAPI';
  apiUrl: string;
  tokenMasked: string | null;
  tokenConfigured: boolean;
  enabledNumber: string;
  licenseReference: string | null;
  timeoutMs: number;
  maxRetries: number;
  retryDelaySeconds: number;
  active: boolean;
  updatedAt: string;
  updatedBy: Pick<User, 'id' | 'name'>;
}

export interface ChannelTestLog {
  id: string;
  channelId: string | null;
  testedBy: Pick<User, 'id' | 'name'>;
  maskedRecipient: string;
  result: 'EXITOSO' | 'ERROR';
  httpStatus: number | null;
  durationMs: number;
  providerMessageId: string | null;
  sanitizedResponse: Record<string, unknown>;
  error: string | null;
  occurredAt: string;
}

export interface NotificationAttempt {
  id: string;
  attemptNumber: number;
  status: 'ENVIADO' | 'FALLIDO_RECUPERABLE' | 'FALLIDO_DEFINITIVO';
  httpStatus: number | null;
  sanitizedResponse: Record<string, unknown>;
  occurredAt: string;
}

export interface NotificationRecord {
  id: string;
  orderId: string;
  order: Order;
  customerId: string;
  customer: Customer;
  event: NotificationEvent;
  status: NotificationStatus;
  recipient: string;
  renderedBody: string;
  scheduledAt: string;
  processedAt: string | null;
  providerMessageId: string | null;
  lastError: string | null;
  resentFromId: string | null;
  attempts?: NotificationAttempt[];
  createdAt: string;
}

export interface ProductionConsolidationSource {
  id: string;
  consolidatedDetailId: string;
  orderDetailId: string;
  presentationId: string;
  presentation: ProductPresentation;
  originalQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  appliedFactor: string;
  baseContribution: string;
  warehouseContribution: string;
  productionContribution: string;
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
  categoryId: string | null;
  category: ProductCategory | null;
  presentationId: string | null;
  presentation: ProductPresentation | null;
  productionAreaId: string | null;
  productionArea: ProductionArea | null;
  productLineId: string;
  productLine: ProductLine;
  baseUnitId: string;
  baseUnit: UnitMeasure;
  requestedQuantity: string;
  warehouseCoveredQuantity: string;
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  stockRequestDetailId: string | null;
  stockRequestDetail: (StockReplenishmentRequestDetail & {
    request: Pick<StockReplenishmentRequest, 'id' | 'code' | 'requiredDate' | 'status'>;
  }) | null;
  additionalProductionQuantity: string;
  plannedQuantity: string;
  additionalProductionReason: string | null;
  preparedQuantity: string;
  receivedQuantity: string;
  stage: ProductionDetailStage;
  scheduledDate: string;
  sequence: number;
  startedAt: string | null;
  completedAt: string | null;
  canceledById: string | null;
  canceledBy: Pick<User, 'id' | 'name' | 'email'> | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  difference: string;
  sources: ProductionConsolidationSource[];
  progress: ProductionProgress[];
  deliveries: ProductionDelivery[];
}

export interface ProductionArea {
  id: string;
  name: string;
  status: RecordStatus;
  categories: ProductCategory[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductionDelivery {
  id: string;
  consolidatedDetailId: string;
  consolidatedDetail: ProductionConsolidationDetail;
  deliveredQuantity: string;
  finalDelivery: boolean;
  productionIncident: string | null;
  status: 'PENDIENTE' | 'ACEPTADA';
  deliveredBy: Pick<User, 'id' | 'name'>;
  deliveredAt: string;
  receivedQuantity: string | null;
  receivedBy: Pick<User, 'id' | 'name'> | null;
  receivedAt: string | null;
  warehouseObservation: string | null;
}

export interface ProductionConsolidation {
  id: string;
  code: number;
  deliveryDate: string;
  preparationDeadlineAt: string | null;
  version: number;
  type: ProductionConsolidationType;
  status: ProductionConsolidationStatus;
  generatedBy: Pick<User, 'id' | 'name' | 'email'>;
  emittedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  emittedAt: string | null;
  closedBy: Pick<User, 'id' | 'name' | 'email'> | null;
  closedAt: string | null;
  incompleteCloseObservation: string | null;
  cancellationReason: string | null;
  canceledBy: Pick<User, 'id' | 'name' | 'email'> | null;
  canceledAt: string | null;
  details: ProductionConsolidationDetail[];
  detailCount?: number;
  createdAt: string;
}

export interface ProductionHistory {
  id: string;
  consolidationId: string;
  previousStatus: ProductionConsolidationStatus | null;
  newStatus: ProductionConsolidationStatus;
  event: 'GENERACION' | 'RECALCULO' | 'AJUSTE_LOTE' | 'PRODUCCION_ADICIONAL' | 'PRODUCTO_AGREGADO' | 'PRODUCTO_RETIRADO' | 'EMISION' | 'PROGRAMACION' | 'INICIO' | 'AVANCE' | 'ENTREGA_PRODUCCION' | 'RECEPCION_ALMACEN' | 'CANCELACION_PRODUCTO' | 'CANCELACION_ORDEN' | 'CIERRE_INCOMPLETO' | 'CIERRE';
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
  categoryName: string | null;
  productionAreaName: string | null;
  presentationId: string | null;
  presentationDescription: string | null;
  baseUnitId: string;
  baseUnitAbbreviation: string;
  requestedQuantity: string;
  warehouseCoveredQuantity: string;
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  additionalProductionQuantity: string;
  plannedQuantity: string;
  preparedQuantity: string;
  receivedQuantity: string;
  pendingQuantity: string;
  difference: string;
}

export interface Vehicle {
  id: string;
  plate: string;
  description: string;
  capacityKg: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PreparationHistory {
  id: string;
  preparationId: string;
  previousStatus: PreparationStatus | null;
  newStatus: PreparationStatus;
  event: 'INICIO' | 'AVANCE' | 'OBSERVACION' | 'CONFIRMACION' | 'ASIGNACION' | 'DESASIGNACION' | 'DESPACHO' | 'CANCELACION' | 'REAPERTURA' | 'ENTREGA_DISTRIBUCION';
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
  physicalSnapshot: string;
  shortageSnapshot: string;
  preparedQuantity: string;
  difference: string;
  observation: string | null;
  verifiedById: string | null;
  verifiedAt: string | null;
  physicalQuantityCurrent: string;
  totalReservedQuantityCurrent: string;
  availableQuantityCurrent: string;
  shortageQuantityCurrent: string;
  pickableQuantityCurrent: string;
  productionReceivedQuantity: string;
  productionPendingQuantity: string;
  relatedProductionOrders: Array<{ id: string; code: number; status: string; scheduledDate: string; receivedQuantity: string; plannedQuantity: string }>;
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
  canceledBy: Pick<User, 'id' | 'name'> | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  handedOffBy: Pick<User, 'id' | 'name'> | null;
  handedOffAt: string | null;
  details: OrderPreparationDetail[];
  history: PreparationHistory[];
  detailCount?: number;
  shortageItemCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PendingDistributionPreparation extends OrderPreparation {
  loadWeightKg: string;
  missingWeightPresentations: string[];
  detailCount: number;
}

export interface EligibleOrder extends Order {
  details: Array<OrderDetail & { reservation: InventoryReservation | null; physicalQuantity: string; totalReservedQuantity: string; availableQuantity: string; shortageQuantity: string; pickableQuantity: string }>;
}

export interface PreparationWorkOrder extends EligibleOrder {
  preparation: OrderPreparation | null;
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
  visitResult: VisitResult;
}

export interface VisitResult {
  id: string;
  routeDeliveryId: string;
  result: VisitResultType;
  user: Pick<User, 'id' | 'name' | 'email'>;
  observation: string | null;
  occurredAt: string;
  details: VisitResultDetail[];
  delivery: RouteDelivery;
}

export interface RouteDelivery {
  id: string;
  routeId: string | null;
  deliveryType: 'REPARTO' | 'FABRICA';
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

export interface FactoryDeliveryCompletion {
  delivery: RouteDelivery;
  generatedSale?: {
    id: string;
    code: number;
    dueDate: string;
    total: string;
  };
}

export interface RouteHistory {
  id: string;
  routeId: string;
  previousStatus: DistributionRouteStatus | null;
  newStatus: DistributionRouteStatus;
  event: 'CREACION' | 'ASIGNACION' | 'DESASIGNACION' | 'CAMBIO_VEHICULO' | 'SECUENCIA' | 'REPROGRAMACION' | 'PLANIFICACION' | 'SALIDA' | 'VISITA' | 'FINALIZACION' | 'LIQUIDACION' | 'CANCELACION';
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
  rescheduledAt: string | null;
  rescheduleReason: string | null;
  canceledAt: string | null;
  cancellationReason: string | null;
  version: number;
  responsibles: RouteResponsible[];
  deliveries: RouteDelivery[];
  history: RouteHistory[];
  deliveryCount?: number;
  loadWeightKg: string;
  capacityExceeded: boolean;
  excessWeightKg: string;
  missingWeightPresentations: string[];
  metrics?: {
    total: number;
    complete: number;
    partial: number;
    notDelivered: number;
    returnedQuantity: string;
    acceptedReturnQuantity: string;
  };
  settlement?: RouteSettlement | null;
  generatedSale?: {
    id: string;
    code: number;
    dueDate: string;
    total: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WarehouseReturnOrderDetail {
  id: string;
  returnOrderId: string;
  expectedQuantity: string;
  receivedQuantity: string;
  stock: Stock;
  visitResultDetail: VisitResultDetail;
}

export interface WarehouseReturnOrder {
  id: string;
  code: number;
  routeId: string;
  route: DistributionRoute;
  status: 'PENDIENTE' | 'RECIBIDA';
  expectedQuantity: string;
  receivedQuantity: string;
  createdBy: Pick<User, 'id' | 'name'>;
  createdAt: string;
  receivedBy: Pick<User, 'id' | 'name'> | null;
  receivedAt: string | null;
  observation: string | null;
  details: WarehouseReturnOrderDetail[];
  detailCount?: number;
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
