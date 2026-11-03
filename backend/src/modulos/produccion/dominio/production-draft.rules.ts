import { ProductionError } from './production-error';
import { decimalForScale, roundForScale, baseContribution } from './production-calculations';
export interface DraftQuantityDetail {
  baseUnit: { decimalScale: number };
  requestedQuantity: string;
  warehouseCoveredQuantity: string;
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  plannedQuantity: string;
  additionalProductionQuantity: string;
  stockRequestDetail: {
    additionalStockQuantity: string;
    request: { productionConsolidationId: string | null; status: string };
  } | null;
  sources: ReadonlyArray<{
    orderDetail: {
      requestedQuantity: string;
      reservedQuantity: string;
      pendingQuantity: string;
      order: { status: string; requestedDate: string };
    };
    appliedFactor: string;
    originalQuantity: string;
    reservedQuantity: string;
    pendingQuantity: string;
    baseContribution: string;
    warehouseContribution: string;
    productionContribution: string;
    presentation: { product: { baseUnit: { decimalScale: number } } };
  }>;
}

export function validateDraftQuantities(
  detail: DraftQuantityDetail,
  sourceDate: string,
  consolidationId: string,
): void {
  let demandTotal = 0;
  let warehouseTotal = 0;
  let productionTotal = 0;
  for (const source of detail.sources) {
    if (source.orderDetail.order.status !== 'CONFIRMADO' || source.orderDetail.order.requestedDate !== sourceDate) {
      throw new ProductionError('inconsistent', 'Una fuente dejó de ser un pedido Confirmado elegible');
    }
    const factor = Number(source.appliedFactor);
    if (!Number.isFinite(factor) || factor <= 0)
      throw new ProductionError('inconsistent', 'Existe una fuente sin factor válido');
    const original = Number(source.originalQuantity);
    const reserved = Number(source.reservedQuantity);
    const pending = Number(source.pendingQuantity);
    if (Math.abs(original - reserved - pending) > 0.000001) {
      throw new ProductionError(
        'inconsistent',
        'La cantidad solicitada no coincide con las cantidades cubierta y pendiente',
      );
    }
    if (
      decimalForScale(Number(source.orderDetail.requestedQuantity), 6) !== decimalForScale(original, 6) ||
      decimalForScale(Number(source.orderDetail.reservedQuantity), 6) !== decimalForScale(reserved, 6) ||
      decimalForScale(Number(source.orderDetail.pendingQuantity), 6) !== decimalForScale(pending, 6)
    ) {
      throw new ProductionError(
        'inconsistent',
        'Las cantidades reservadas o pendientes del pedido cambiaron después del cálculo',
      );
    }
    const sourceScale = source.presentation.product.baseUnit.decimalScale;
    const expectedDemand = baseContribution(original, factor, sourceScale);
    const expectedWarehouse = baseContribution(reserved, factor, sourceScale);
    const expectedProduction = roundForScale(expectedDemand - expectedWarehouse, sourceScale);
    if (
      decimalForScale(expectedDemand, sourceScale) !== decimalForScale(Number(source.baseContribution), sourceScale)
    ) {
      throw new ProductionError('inconsistent', 'El aporte en unidad base no coincide con su cantidad y factor');
    }
    if (
      decimalForScale(expectedWarehouse, sourceScale) !==
        decimalForScale(Number(source.warehouseContribution), sourceScale) ||
      decimalForScale(expectedProduction, sourceScale) !==
        decimalForScale(Number(source.productionContribution), sourceScale)
    ) {
      throw new ProductionError(
        'inconsistent',
        'Los aportes de Almacén y Producción no coinciden con la reserva del pedido',
      );
    }
    demandTotal = roundForScale(demandTotal + original, detail.baseUnit.decimalScale);
    warehouseTotal = roundForScale(warehouseTotal + reserved, detail.baseUnit.decimalScale);
    productionTotal = roundForScale(productionTotal + pending, detail.baseUnit.decimalScale);
  }
  if (
    decimalForScale(demandTotal, detail.baseUnit.decimalScale) !==
    decimalForScale(Number(detail.requestedQuantity), detail.baseUnit.decimalScale)
  ) {
    throw new ProductionError('inconsistent', 'La suma de los pedidos de origen no coincide con el total consolidado');
  }
  if (
    decimalForScale(warehouseTotal, detail.baseUnit.decimalScale) !==
      decimalForScale(Number(detail.warehouseCoveredQuantity), detail.baseUnit.decimalScale) ||
    decimalForScale(productionTotal, detail.baseUnit.decimalScale) !==
      decimalForScale(Number(detail.productionRequiredQuantity), detail.baseUnit.decimalScale)
  ) {
    throw new ProductionError(
      'inconsistent',
      'El saldo cubierto por Almacén o el faltante de Producción no coincide con sus fuentes',
    );
  }
  const stockRequested = Number(detail.stockRequestedQuantity);
  if (detail.stockRequestDetail) {
    if (
      detail.stockRequestDetail.request.productionConsolidationId !== consolidationId ||
      detail.stockRequestDetail.request.status !== 'PROGRAMADA' ||
      decimalForScale(Number(detail.stockRequestDetail.additionalStockQuantity), detail.baseUnit.decimalScale) !==
        decimalForScale(stockRequested, detail.baseUnit.decimalScale)
    ) {
      throw new ProductionError(
        'inconsistent',
        'La cantidad solicitada para stock no coincide con su solicitud de abastecimiento',
      );
    }
  } else if (stockRequested !== 0) {
    throw new ProductionError(
      'inconsistent',
      'Existe una cantidad para stock sin solicitud de abastecimiento asociada',
    );
  }
  const required = Number(detail.productionRequiredQuantity) + stockRequested;
  const planned = Number(detail.plannedQuantity);
  const adjustment = Number(detail.additionalProductionQuantity);
  if (
    planned < required ||
    decimalForScale(planned - required, detail.baseUnit.decimalScale) !==
      decimalForScale(adjustment, detail.baseUnit.decimalScale)
  ) {
    throw new ProductionError(
      'inconsistent',
      'El plan no coincide con el faltante, la solicitud para stock y el ajuste técnico',
    );
  }
  if (planned <= 0 && !detail.sources.length) {
    throw new ProductionError(
      'inconsistent',
      'Una fila sin pedidos debe conservar una solicitud para stock mayor a cero',
    );
  }
}
