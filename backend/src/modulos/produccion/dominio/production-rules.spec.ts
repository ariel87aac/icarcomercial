import { describe, expect, it } from 'vitest';
import { adjustProductionPlan, scheduleProductionDetail } from './production-plan.rules';
import { calculateProductionDelivery } from './production-deliveries.rules';
import { calculateProductionReceipt } from './receive-production.rules';
import { isProductionReceived, validateProductionClosure } from './production-close.rules';
import { ProductionDeliveryStatus, ProductionDetailStage } from './production.enums';
import { groupOrderDemand, OrderProductionSource } from './production-demand.rules';
import { validateDraftQuantities, DraftQuantityDetail } from './production-draft.rules';

const plan = () => ({
  baseUnit: { decimalScale: 3 },
  productionRequiredQuantity: '5',
  stockRequestedQuantity: '2',
  plannedQuantity: '7',
  additionalProductionQuantity: '0',
  additionalProductionReason: null as string | null,
  preparedQuantity: '2',
  difference: '-5',
  scheduledDate: '2026-11-03',
  sequence: 1,
});
const source = (): OrderProductionSource => ({
  order: { status: 'CONFIRMADO', requestedDate: '2026-11-03' },
  presentationDescriptionSnapshot: 'Caja',
  requestedQuantity: '8',
  reservedQuantity: '3',
  pendingQuantity: '5',
  presentation: {
    id: 'box',
    conversionFactor: '2',
    unitId: 'unit',
    unit: { decimalScale: 3 },
    product: {
      id: 'product',
      categoryId: 'category',
      productLineId: 'line',
      baseUnitId: 'base',
      baseUnit: { decimalScale: 3 },
    },
  },
});

describe('reglas de Producción sin framework ni base de datos', () => {
  it('separa demanda, cobertura, faltante y conversión sin descontar stock dos veces', () => {
    const group = groupOrderDemand([source(), source()], '2026-11-03', new Map([['category', 'area']])).get('box')!;
    expect(group).toMatchObject({ requestedQuantity: 16, warehouseCoveredQuantity: 6, productionRequiredQuantity: 10 });
    expect(group.sources[0]).toMatchObject({
      baseContribution: 16,
      warehouseContribution: 6,
      productionContribution: 10,
    });
  });
  it('rechaza fuentes de otra fecha o con cantidades inconsistentes', () => {
    expect(() => groupOrderDemand([source()], '2026-11-04', new Map())).toThrow('Confirmados');
    expect(() => groupOrderDemand([{ ...source(), pendingQuantity: '8' }], '2026-11-03', new Map())).toThrow(
      'conversión',
    );
  });
  it('impide reducir el plan por debajo de pedidos y stock sin mutar el detalle', () => {
    const detail = plan();
    expect(() => adjustProductionPlan(detail, { plannedQuantity: 6 })).toThrow('menor');
    expect(detail).toEqual(plan());
    adjustProductionPlan(detail, { additionalQuantity: 3, reason: '  Lote completo  ' });
    expect(detail).toMatchObject({
      plannedQuantity: '10.000',
      additionalProductionQuantity: '3.000',
      difference: '-8.000',
      additionalProductionReason: 'Lote completo',
    });
  });
  it('exige motivo al programar cantidades adicionales y conserva el estado al fallar', () => {
    const detail = plan();
    expect(() =>
      scheduleProductionDetail(detail, { additionalQuantity: 1, scheduledDate: '2026-11-04', sequence: 2 }),
    ).toThrow('explicar');
    expect(detail).toEqual(plan());
  });
  it('exige entrega final al cubrir el plan y documenta faltantes o excedentes', () => {
    const detail = { baseUnit: { decimalScale: 3 }, preparedQuantity: '4', plannedQuantity: '10' };
    expect(() => calculateProductionDelivery(detail, { quantity: 6, finalDelivery: false })).toThrow('final');
    expect(() => calculateProductionDelivery(detail, { quantity: 5, finalDelivery: true })).toThrow('documentar');
    expect(
      calculateProductionDelivery(detail, { quantity: 5, finalDelivery: true, incident: 'Faltó material' }),
    ).toMatchObject({ produced: 9, difference: -1 });
    expect(() => calculateProductionDelivery(detail, { quantity: 0.0001, finalDelivery: false })).toThrow('válida');
  });
  it('rechaza recepción repetida y exige observación para diferencias reales', () => {
    const delivery = {
      status: ProductionDeliveryStatus.PENDING,
      deliveredQuantity: '10',
      consolidatedDetail: { baseUnit: { decimalScale: 3 } },
    };
    expect(() =>
      calculateProductionReceipt({ ...delivery, status: ProductionDeliveryStatus.ACCEPTED }, { receivedQuantity: 10 }),
    ).toThrow('ya fue recibida');
    expect(() => calculateProductionReceipt(delivery, { receivedQuantity: 9 })).toThrow('documentar');
    expect(calculateProductionReceipt(delivery, { receivedQuantity: 9, observation: '  Envase roto  ' })).toMatchObject(
      { received: 9, observation: 'Envase roto' },
    );
  });
  it('no cierra automáticamente entregas pendientes, canceladas ni recibidas parcialmente', () => {
    const row = {
      stage: ProductionDetailStage.COMPLETED,
      plannedQuantity: '10',
      receivedQuantity: '10',
      difference: '0',
    };
    expect(isProductionReceived([])).toBe(false);
    expect(isProductionReceived([row])).toBe(true);
    expect(isProductionReceived([{ ...row, stage: ProductionDetailStage.CANCELLED }])).toBe(false);
    expect(isProductionReceived([{ ...row, receivedQuantity: '9' }])).toBe(false);
    expect(() => validateProductionClosure([{ ...row, receivedQuantity: '9' }])).toThrow('incompleto');
    expect(() => validateProductionClosure([{ ...row, difference: '1' }])).toThrow('observación');
  });
  it('detecta cambios en las reservas entre generación y emisión del borrador', () => {
    const detail: DraftQuantityDetail = {
      baseUnit: { decimalScale: 3 },
      requestedQuantity: '8',
      warehouseCoveredQuantity: '3',
      productionRequiredQuantity: '5',
      stockRequestedQuantity: '0',
      plannedQuantity: '5',
      additionalProductionQuantity: '0',
      stockRequestDetail: null,
      sources: [
        {
          orderDetail: source(),
          appliedFactor: '2',
          originalQuantity: '8',
          reservedQuantity: '3',
          pendingQuantity: '5',
          baseContribution: '16',
          warehouseContribution: '6',
          productionContribution: '10',
          presentation: source().presentation,
        },
      ],
    };
    expect(() => validateDraftQuantities(detail, '2026-11-03', 'consolidation')).not.toThrow();
    detail.sources[0].orderDetail.reservedQuantity = '2';
    expect(() => validateDraftQuantities(detail, '2026-11-03', 'consolidation')).toThrow('cambiaron');
  });
});
