import { ProductionError } from './production-error';
import { ProductionConsolidationStatus, ProductionDetailStage } from './production.enums';
export function assertStartStatus(status: ProductionConsolidationStatus): void {
  if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(status)) {
    throw new ProductionError('conflict', 'El producto solo puede iniciarse en una orden Emitida o En proceso');
  }
}

export function assertStartStage(stage: ProductionDetailStage): void {
  if (![ProductionDetailStage.PENDING, ProductionDetailStage.PARTIALLY_RECEIVED].includes(stage)) {
    throw new ProductionError('conflict', 'El producto no se encuentra disponible para iniciar producción');
  }
}

export function assertProgressStatus(status: ProductionConsolidationStatus): void {
  if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(status)) {
    throw new ProductionError(
      'conflict',
      'Los avances solo pueden registrarse en requerimientos Emitidos o En proceso',
    );
  }
}

export function assertProgressPlan(plannedQuantity: string): void {
  if (Number(plannedQuantity) <= 0) {
    throw new ProductionError('conflict', 'Este producto no tiene cantidad planificada para Producción');
  }
}

export function assertCancelDetailStatus(status: ProductionConsolidationStatus): void {
  if (
    ![
      ProductionConsolidationStatus.DRAFT,
      ProductionConsolidationStatus.ISSUED,
      ProductionConsolidationStatus.IN_PROGRESS,
    ].includes(status)
  ) {
    throw new ProductionError('conflict', 'El producto ya no puede cancelarse en el estado actual de la orden');
  }
}

export function assertCancelDetailStage(stage: ProductionDetailStage): void {
  if ([ProductionDetailStage.COMPLETED, ProductionDetailStage.CANCELLED].includes(stage)) {
    throw new ProductionError('conflict', 'El producto ya se encuentra completado o cancelado');
  }
}

export function assertCancelStatus(status: ProductionConsolidationStatus): void {
  if (
    ![
      ProductionConsolidationStatus.DRAFT,
      ProductionConsolidationStatus.ISSUED,
      ProductionConsolidationStatus.IN_PROGRESS,
    ].includes(status)
  ) {
    throw new ProductionError('conflict', 'La orden ya no puede cancelarse en su estado actual');
  }
}

export function assertNoReceivedProducts(details: ReadonlyArray<{ receivedQuantity: string }>): void {
  if (details.some((detail) => Number(detail.receivedQuantity) > 0)) {
    throw new ProductionError(
      'conflict',
      'La orden ya tiene productos recibidos en Almacén; utilice cierre incompleto',
    );
  }
}

export function assertIncompleteCloseStatus(status: ProductionConsolidationStatus): void {
  if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(status)) {
    throw new ProductionError('conflict', 'Solo una orden Emitida o En proceso puede cerrarse de manera incompleta');
  }
}

export function assertCloseStatus(status: ProductionConsolidationStatus): void {
  if (![ProductionConsolidationStatus.ISSUED, ProductionConsolidationStatus.IN_PROGRESS].includes(status)) {
    throw new ProductionError('conflict', 'Solo un requerimiento Emitido o En proceso puede cerrarse');
  }
}

export function assertPlanEditable(status: ProductionConsolidationStatus): void {
  if (status !== ProductionConsolidationStatus.DRAFT) {
    throw new ProductionError(
      'conflict',
      'El ajuste por batch o capacidad solo puede modificarse mientras la orden está en Borrador',
    );
  }
}

export function assertScheduleEditable(status: ProductionConsolidationStatus): void {
  if (status !== ProductionConsolidationStatus.DRAFT) {
    throw new ProductionError('conflict', 'La programación solo puede modificarse mientras la orden está en Borrador');
  }
}

export function assertRecalculationAllowed(status: ProductionConsolidationStatus): void {
  if (status !== ProductionConsolidationStatus.DRAFT) {
    throw new ProductionError('conflict', 'Solo una consolidación en Borrador puede recalcularse');
  }
}

export function assertEmissionAllowed(status: ProductionConsolidationStatus): void {
  if (status !== ProductionConsolidationStatus.DRAFT) {
    throw new ProductionError('conflict', 'Solo un Borrador puede emitirse');
  }
}
