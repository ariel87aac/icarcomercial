import type { DistributionRouteStatus, RecordStatus, VisitResultType } from '../../../compartido/modelos-base';
import type { Stock } from '../../almacen/dominio/modelos-almacen';
import type { CustomerAddress, Zone } from '../../clientes/dominio/modelos-clientes';
import type { Order } from '../../pedidos/dominio/modelos-pedidos';
import type { OrderPreparation, OrderPreparationDetail, PendingDistributionPreparation } from '../../preparacion/dominio/modelos-preparacion';
import type { User } from '../../seguridad/dominio/modelos-seguridad';

export interface Vehicle {
  id: string;
  plate: string;
  description: string;
  capacityKg: string | null;
  status: RecordStatus;
  createdAt: string;
  updatedAt: string;
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
