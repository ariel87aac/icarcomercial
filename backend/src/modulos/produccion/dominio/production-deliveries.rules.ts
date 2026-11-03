import { ProductionError } from './production-error';
import { ProductionConsolidationStatus, ProductionDetailStage } from './production.enums';
import { roundForScale, productionDifference } from './production-calculations';
export function assertDeliveryAllowed<
  T extends {
    consolidation: { status: ProductionConsolidationStatus };
    stage: ProductionDetailStage;
    presentationId: string | null;
    presentation: object | null;
  },
>(detail: T): asserts detail is T & { presentation: NonNullable<T['presentation']> } {
  if (detail.consolidation.status !== ProductionConsolidationStatus.IN_PROGRESS) {
    throw new ProductionError('conflict', 'La orden debe estar En proceso para registrar una entrega');
  }
  if (![ProductionDetailStage.IN_PROGRESS, ProductionDetailStage.PARTIALLY_RECEIVED].includes(detail.stage)) {
    throw new ProductionError('conflict', 'Debe iniciar este producto antes de registrar su entrega');
  }
  if (!detail.presentationId || !detail.presentation) {
    throw new ProductionError(
      'inconsistent',
      'El producto no tiene una presentación definida para su ingreso a Almacén',
    );
  }
}

export function calculateProductionDelivery(
  detail: { baseUnit: { decimalScale: number }; preparedQuantity: string; plannedQuantity: string },
  dto: { quantity: number; finalDelivery: boolean; incident?: string },
) {
  const scale = detail.baseUnit.decimalScale;
  const quantity = roundForScale(dto.quantity, scale);
  if (quantity <= 0) throw new ProductionError('invalid', 'La cantidad entregada no es válida para la presentación');
  const produced = roundForScale(Number(detail.preparedQuantity) + quantity, scale);
  const difference = productionDifference(produced, Number(detail.plannedQuantity), scale);
  if (!dto.finalDelivery && produced >= Number(detail.plannedQuantity)) {
    throw new ProductionError('inconsistent', 'Al completar o superar el plan, la entrega debe marcarse como final');
  }
  const incident = dto.incident?.trim() || null;
  if (dto.finalDelivery && difference !== 0 && !incident) {
    throw new ProductionError('inconsistent', 'Debe documentar el motivo cuando la cantidad real sea distinta al plan');
  }

  return { scale, quantity, produced, difference, incident };
}
