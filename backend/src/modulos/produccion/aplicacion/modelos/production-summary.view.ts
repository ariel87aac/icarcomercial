import { ProductionConsolidationStatus, ProductionConsolidationType } from '../../dominio/production.enums';

export interface ProductionSummaryView {
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
