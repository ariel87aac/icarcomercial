import { ProductionError } from './production-error';
import { ProductionDeliveryStatus } from './production.enums';
import { roundForScale } from './production-calculations';
export function calculateProductionReceipt(
  delivery: {
    status: ProductionDeliveryStatus;
    deliveredQuantity: string;
    consolidatedDetail: { baseUnit: { decimalScale: number } };
  },
  dto: { receivedQuantity: number; observation?: string },
) {
  if (delivery.status !== ProductionDeliveryStatus.PENDING) {
    throw new ProductionError('conflict', 'La entrega ya fue recibida en Almacén');
  }
  const detail = delivery.consolidatedDetail;
  const scale = detail.baseUnit.decimalScale;
  const received = roundForScale(dto.receivedQuantity, scale);
  if (received <= 0) throw new ProductionError('invalid', 'La cantidad recibida no es válida para la presentación');
  const observation = dto.observation?.trim() || null;
  if (received !== roundForScale(Number(delivery.deliveredQuantity), scale) && !observation) {
    throw new ProductionError('inconsistent', 'Debe documentar la diferencia entre lo entregado y lo recibido');
  }

  return { scale, received, observation };
}
