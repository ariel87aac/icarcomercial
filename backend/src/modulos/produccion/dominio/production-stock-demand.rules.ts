import { ProductionError } from './production-error';
import { RecordStatus } from '../../../compartido/enumeraciones/record-status.enum';
import { roundForScale } from './production-calculations';
import type { ConsolidatedGroup } from './production-demand.rules';
interface StockDemand {
  id: string;
  additionalStockQuantity: string;
  presentation: {
    id: string;
    status: string;
    unitId: string;
    unit: { decimalScale: number };
    product: { id: string; status: string; categoryId: string; category: { name: string }; productLineId: string };
  };
}
export function addStockDemand<T>(
  groups: ReadonlyMap<string, ConsolidatedGroup<T>>,
  requestDetail: StockDemand,
  areaByCategory: ReadonlyMap<string, string>,
) {
  const presentation = requestDetail.presentation;
  const product = presentation.product;
  if (presentation.status !== RecordStatus.ACTIVE || product.status !== RecordStatus.ACTIVE) {
    throw new ProductionError(
      'inconsistent',
      'La solicitud de abastecimiento contiene una presentación o producto inactivo',
    );
  }
  const productionAreaId = areaByCategory.get(product.categoryId) ?? null;
  if (!productionAreaId) {
    throw new ProductionError(
      'inconsistent',
      `La categoría ${product.category.name} no tiene un área de Producción activa asignada`,
    );
  }
  const scale = presentation.unit.decimalScale;
  const requestedStock = roundForScale(Number(requestDetail.additionalStockQuantity), scale);
  const existingGroup = groups.get(presentation.id);
  if (!Number.isFinite(requestedStock) || requestedStock < 0) {
    throw new ProductionError(
      'inconsistent',
      'La solicitud de abastecimiento contiene una cantidad adicional inválida',
    );
  }
  if (requestedStock === 0 && (!existingGroup || existingGroup.productionRequiredQuantity <= 0)) {
    throw new ProductionError(
      'inconsistent',
      'La solicitud contiene un producto sin faltante ni cantidad adicional para stock',
    );
  }
  const group = existingGroup ?? {
    productId: product.id,
    categoryId: product.categoryId,
    productLineId: product.productLineId,
    presentationId: presentation.id,
    baseUnitId: presentation.unitId,
    productionAreaId,
    decimalScale: scale,
    requestedQuantity: 0,
    warehouseCoveredQuantity: 0,
    productionRequiredQuantity: 0,
    stockRequestedQuantity: 0,
    stockRequestDetailId: null,
    sources: [],
  };
  group.categoryId = product.categoryId;
  group.productionAreaId = productionAreaId;
  group.stockRequestedQuantity = requestedStock;
  group.stockRequestDetailId = requestDetail.id;

  return { group, product, presentation, productionAreaId };
}
