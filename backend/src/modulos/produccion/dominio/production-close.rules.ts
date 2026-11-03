import { ProductionError } from './production-error';
import { ProductionDetailStage } from './production.enums';
interface ReceiptState {
  stage: ProductionDetailStage;
  receivedQuantity: string;
  plannedQuantity: string;
}
export function isProductionReceived(details: readonly ReceiptState[]): boolean {
  const terminal = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
  return (
    details.length > 0 &&
    details.every(
      (detail) =>
        terminal.includes(detail.stage) && !(Number(detail.receivedQuantity) < Number(detail.plannedQuantity)),
    )
  );
}
export function validateProductionClosure(
  details: ReadonlyArray<ReceiptState & { difference: string }>,
  value?: string,
) {
  const terminalStages = [ProductionDetailStage.COMPLETED, ProductionDetailStage.CLOSED_WITH_INCIDENT];
  if (details.some((detail) => !terminalStages.includes(detail.stage))) {
    throw new ProductionError(
      'inconsistent',
      'No se puede cerrar la orden hasta que Almacén reciba la entrega final de cada producto',
    );
  }
  if (details.some((detail) => Number(detail.receivedQuantity) < Number(detail.plannedQuantity))) {
    throw new ProductionError(
      'inconsistent',
      'Existen cantidades pendientes; utilice el cierre incompleto e indique el motivo',
    );
  }
  const hasDifference = details.some((detail) => Number(detail.difference) !== 0);
  const observation = value?.trim() || null;
  if (hasDifference && !observation) {
    throw new ProductionError('inconsistent', 'Debe registrar una observación para cerrar con faltante o excedente');
  }

  return { hasDifference, observation };
}
