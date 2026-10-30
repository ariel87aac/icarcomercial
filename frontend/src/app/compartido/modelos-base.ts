

export type RecordStatus = 'ACTIVO' | 'INACTIVO';
export type CustomerType = 'PUBLICO' | 'MINORISTA' | 'DISTRIBUIDOR' | 'MAYORISTA';
export type PaymentCondition = 'CONTADO' | 'CREDITO';
export type UserType = 'INTERNO' | 'CLIENTE';
export type OrderStatus = 'BORRADOR' | 'RECIBIDO' | 'CONFIRMADO' | 'CANCELADO';
export type OrderOrigin = 'PORTAL' | 'INTERNO';
export type InventoryMovementType = 'INGRESO' | 'AJUSTE_POSITIVO' | 'AJUSTE_NEGATIVO' | 'SALIDA_DESPACHO' | 'ENTRADA_DEVOLUCION' | 'INGRESO_PRODUCCION';
export type StockReplenishmentRequestStatus = 'BORRADOR' | 'ENVIADA' | 'PROGRAMADA' | 'CERRADA' | 'CERRADA_INCOMPLETA';
export type ProductionConsolidationStatus = 'BORRADOR' | 'EMITIDA' | 'EN_PROCESO' | 'CERRADA' | 'CANCELADA' | 'CERRADA_INCOMPLETA';
export type ProductionConsolidationType = 'PRINCIPAL' | 'COMPLEMENTARIA';
export type ProductionDetailStage = 'PENDIENTE' | 'EN_PROCESO' | 'PENDIENTE_RECEPCION' | 'RECIBIDO_PARCIAL' | 'COMPLETADO' | 'CERRADO_CON_INCIDENCIA' | 'CANCELADO';
export type PreparationStatus = 'PENDIENTE' | 'EN_PREPARACION' | 'OBSERVADA' | 'PREPARADA' | 'ASIGNADA' | 'DESPACHADA' | 'CANCELADA';
export type DistributionRouteStatus = 'BORRADOR' | 'PLANIFICADA' | 'EN_REPARTO' | 'FINALIZADA' | 'LIQUIDADA' | 'CANCELADA';
export type VisitResultType = 'ENTREGADA' | 'ENTREGA_PARCIAL' | 'NO_ENTREGADA';
export type PublicTrackingStatus = 'BORRADOR' | 'RECIBIDO' | 'CANCELADO' | 'DISPONIBLE_PARA_PREPARAR' | 'ASIGNADO' | 'ENTREGA_PARCIAL' | 'PEDIDO_CONFIRMADO' | 'EN_PREPARACION' | 'PREPARADO' | 'EN_RUTA' | 'ENTREGADO' | 'ENTREGA_NO_COMPLETADA';
export type NotificationEvent = 'EN_PREPARACION' | 'DISPONIBLE_PARA_PREPARAR' | 'PREPARADO' | 'ASIGNADO' | 'ENTREGA_PARCIAL' | 'PEDIDO_BORRADOR' | 'PEDIDO_RECIBIDO' | 'PEDIDO_CONFIRMADO' | 'PEDIDO_CANCELADO' | 'CAMBIO_RELEVANTE' | 'SALIDA_RUTA' | 'PROXIMA_ENTREGA' | 'ENTREGADO' | 'ENTREGA_NO_COMPLETADA' | 'PAGO_RECIBIDO';
export type NotificationStatus = 'PENDIENTE' | 'PROCESANDO' | 'ENVIADO' | 'ENTREGADO' | 'REINTENTO' | 'FALLIDO';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}
