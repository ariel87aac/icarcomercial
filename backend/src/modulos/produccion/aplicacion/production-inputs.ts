import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { ProductionConsolidationStatus, ProductionConsolidationType } from '../dominio/production.enums';

export interface GenerateProductionConsolidationCommand {
  deliveryDate: string;
  stockRequestId?: string;
}

export interface ScheduleProductionDetailCommand {
  scheduledDate: string;
  sequence: number;
  additionalQuantity: number;
  reason?: string;
}

export interface ProductionReasonCommand {
  reason: string;
}

export interface ProductionConsolidationQuery {
  page: number;
  limit: number;
  code?: number;
  deliveryDate?: string;
  productionAreaId?: string;
  categoryId?: string;
  productId?: string;
  version?: number;
  type?: ProductionConsolidationType;
  status?: ProductionConsolidationStatus;
  statuses?: ProductionConsolidationStatus[];
}

export interface RegisterProductionProgressCommand {
  consolidatedDetailId: string;
  quantity: number;
  observation?: string;
}

export interface AdjustProductionPlanCommand {
  plannedQuantity?: number;
  additionalQuantity?: number;
  reason?: string;
}

export interface CreateProductionAreaCommand {
  name: string;
  categoryIds: string[];
}

export interface UpdateProductionAreaCommand {
  name?: string;
  status?: RecordStatus;
  categoryIds?: string[];
}

export interface RegisterProductionDeliveryCommand {
  quantity: number;
  finalDelivery: boolean;
  incident?: string;
}

export interface ReceiveProductionDeliveryCommand {
  receivedQuantity: number;
  observation?: string;
}

export interface CloseProductionConsolidationCommand {
  observation?: string;
}
