export enum ProductionConsolidationStatus {
  DRAFT = 'BORRADOR',
  ISSUED = 'EMITIDA',
  IN_PROGRESS = 'EN_PROCESO',
  CLOSED = 'CERRADA',
}

export enum ProductionConsolidationType {
  MAIN = 'PRINCIPAL',
  COMPLEMENTARY = 'COMPLEMENTARIA',
}

export enum ProductionProgressType {
  PROGRESS = 'AVANCE',
}

export enum ProductionHistoryEvent {
  GENERATION = 'GENERACION',
  RECALCULATION = 'RECALCULO',
  ISSUE = 'EMISION',
  START = 'INICIO',
  PROGRESS = 'AVANCE',
  CLOSE = 'CIERRE',
}
