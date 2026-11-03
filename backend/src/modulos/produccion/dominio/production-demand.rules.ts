import { ProductionError } from './production-error';
import { roundForScale, baseContribution } from './production-calculations';
export interface OrderProductionSource {
  order: { status: string; requestedDate: string };
  presentationDescriptionSnapshot: string;
  requestedQuantity: string;
  reservedQuantity: string;
  pendingQuantity: string;
  presentation: {
    id: string;
    conversionFactor: string;
    unitId: string;
    unit: { decimalScale: number };
    product: {
      id: string;
      categoryId: string;
      productLineId: string;
      baseUnitId: string;
      baseUnit: { decimalScale: number };
    };
  };
}

interface ResolvedSource<T> {
  orderDetail: T;
  originalQuantity: number;
  reservedQuantity: number;
  pendingQuantity: number;
  appliedFactor: number;
  baseContribution: number;
  warehouseContribution: number;
  productionContribution: number;
  decimalScale: number;
}
export interface ConsolidatedGroup<T> {
  productId: string;
  categoryId: string;
  productLineId: string;
  presentationId: string;
  baseUnitId: string;
  productionAreaId: string | null;
  decimalScale: number;
  requestedQuantity: number;
  warehouseCoveredQuantity: number;
  productionRequiredQuantity: number;
  stockRequestedQuantity: number;
  stockRequestDetailId: string | null;
  sources: ResolvedSource<T>[];
}

export function groupOrderDemand<T extends OrderProductionSource>(
  orderDetails: readonly T[],
  sourceDate: string,
  areaByCategory: ReadonlyMap<string, string>,
): Map<string, ConsolidatedGroup<T>> {
  const groups = new Map<string, ConsolidatedGroup<T>>();
  for (const orderDetail of orderDetails) {
    if (orderDetail.order.status !== 'CONFIRMADO' || orderDetail.order.requestedDate !== sourceDate) {
      throw new ProductionError(
        'inconsistent',
        'Solo se pueden consolidar detalles de pedidos Confirmados para la fecha seleccionada',
      );
    }
    const presentation = orderDetail.presentation;
    const product = presentation?.product;
    const factor = Number(presentation?.conversionFactor);
    if (!product?.productLineId)
      throw new ProductionError('inconsistent', 'Existe un producto sin línea productiva válida');
    if (!product.baseUnitId || !product.baseUnit)
      throw new ProductionError('inconsistent', 'Existe un producto sin unidad base válida');
    if (!presentation?.id || !Number.isFinite(factor) || factor <= 0) {
      throw new ProductionError(
        'inconsistent',
        `La presentación ${orderDetail.presentationDescriptionSnapshot} no tiene un factor de conversión válido`,
      );
    }
    const scale = presentation.unit.decimalScale;
    const baseScale = product.baseUnit.decimalScale;
    const original = Number(orderDetail.requestedQuantity);
    const reserved = Number(orderDetail.reservedQuantity);
    const pending = Number(orderDetail.pendingQuantity);
    const contribution = baseContribution(original, factor, baseScale);
    const warehouseContribution = baseContribution(reserved, factor, baseScale);
    const productionContribution = roundForScale(contribution - warehouseContribution, baseScale);
    if (
      !Number.isFinite(original) ||
      !Number.isFinite(reserved) ||
      !Number.isFinite(pending) ||
      original <= 0 ||
      reserved < 0 ||
      pending < 0 ||
      contribution <= 0 ||
      Math.abs(original - reserved - pending) > 0.000001 ||
      productionContribution < 0
    ) {
      throw new ProductionError('inconsistent', 'La conversión produjo una cantidad no válida');
    }
    const key = presentation.id;
    const group = groups.get(key) ?? {
      productId: product.id,
      categoryId: product.categoryId,
      productLineId: product.productLineId,
      presentationId: presentation.id,
      baseUnitId: presentation.unitId,
      productionAreaId: areaByCategory.get(product.categoryId) ?? null,
      decimalScale: scale,
      requestedQuantity: 0,
      warehouseCoveredQuantity: 0,
      productionRequiredQuantity: 0,
      stockRequestedQuantity: 0,
      stockRequestDetailId: null,
      sources: [],
    };
    group.requestedQuantity = roundForScale(group.requestedQuantity + original, scale);
    group.warehouseCoveredQuantity = roundForScale(group.warehouseCoveredQuantity + reserved, scale);
    group.productionRequiredQuantity = roundForScale(group.productionRequiredQuantity + pending, scale);
    group.sources.push({
      orderDetail,
      originalQuantity: original,
      reservedQuantity: reserved,
      pendingQuantity: pending,
      appliedFactor: factor,
      baseContribution: contribution,
      warehouseContribution,
      productionContribution,
      decimalScale: 6,
    });
    groups.set(key, group);
  }

  return groups;
}
