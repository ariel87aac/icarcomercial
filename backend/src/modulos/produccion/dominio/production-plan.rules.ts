import { ProductionError } from './production-error';
import { roundForScale, decimalForScale, productionDifference, batchAdjustment } from './production-calculations';
interface PlanDetail {
  baseUnit: { decimalScale: number };
  productionRequiredQuantity: string;
  stockRequestedQuantity: string;
  plannedQuantity: string;
  additionalProductionQuantity: string;
  additionalProductionReason: string | null;
  preparedQuantity: string;
  difference: string;
  scheduledDate: string;
  sequence: number;
}
export function adjustProductionPlan(
  detail: PlanDetail,
  dto: { additionalQuantity?: number; plannedQuantity?: number; reason?: string },
) {
  const scale = detail.baseUnit.decimalScale;
  const required = roundForScale(
    Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
    scale,
  );
  if (dto.additionalQuantity === undefined && dto.plannedQuantity === undefined) {
    throw new ProductionError('invalid', 'Debe indicar la cantidad del ajuste por batch o capacidad');
  }
  const planned = roundForScale(
    dto.additionalQuantity !== undefined ? required + dto.additionalQuantity : Number(dto.plannedQuantity),
    scale,
  );
  if (planned < required) {
    throw new ProductionError(
      'inconsistent',
      'La cantidad planificada no puede ser menor al faltante de pedidos más la solicitud para stock',
    );
  }
  const adjustment = batchAdjustment(planned, required, scale);
  const previousPlanned = detail.plannedQuantity;
  detail.plannedQuantity = decimalForScale(planned, scale);
  detail.additionalProductionQuantity = decimalForScale(adjustment, scale);
  detail.additionalProductionReason = adjustment > 0 ? dto.reason?.trim() || null : null;
  detail.difference = decimalForScale(productionDifference(Number(detail.preparedQuantity), planned, scale), scale);

  return { previousPlanned, adjustment };
}

export function scheduleProductionDetail(
  detail: PlanDetail,
  dto: { additionalQuantity: number; reason?: string; scheduledDate: string; sequence: number },
) {
  const reason = dto.reason?.trim() || null;
  if (dto.additionalQuantity > 0 && (!reason || reason.length < 5)) {
    throw new ProductionError(
      'inconsistent',
      'Debe explicar el ajuste por batch o capacidad con al menos 5 caracteres',
    );
  }
  const scale = detail.baseUnit.decimalScale;
  const required = roundForScale(
    Number(detail.productionRequiredQuantity) + Number(detail.stockRequestedQuantity),
    scale,
  );
  const additional = roundForScale(dto.additionalQuantity, scale);
  const planned = roundForScale(required + additional, scale);
  const previous = {
    scheduledDate: detail.scheduledDate,
    sequence: detail.sequence,
    additionalQuantity: detail.additionalProductionQuantity,
    plannedQuantity: detail.plannedQuantity,
  };
  detail.scheduledDate = dto.scheduledDate;
  detail.sequence = dto.sequence;
  detail.additionalProductionQuantity = decimalForScale(additional, scale);
  detail.additionalProductionReason = additional > 0 ? reason : null;
  detail.plannedQuantity = decimalForScale(planned, scale);
  detail.difference = decimalForScale(productionDifference(Number(detail.preparedQuantity), planned, scale), scale);

  return { previous };
}
