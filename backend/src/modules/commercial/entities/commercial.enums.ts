export enum SaleStatus {
  DRAFT = 'BORRADOR',
  ISSUED = 'EMITIDA',
  PARTIALLY_PAID = 'PAGO_PARCIAL',
  PAID = 'PAGADA',
  VOIDED = 'ANULADA',
}

export enum VoucherStatus {
  ISSUED = 'EMITIDO',
  VOIDED = 'ANULADO',
}

export enum PaymentStatus {
  REGISTERED = 'REGISTRADO',
  CONFIRMED = 'CONFIRMADO',
  VOIDED = 'ANULADO',
}

export enum AccountMovementType {
  SALE_DEBIT = 'DEBITO_VENTA',
  PAYMENT_CREDIT = 'CREDITO_PAGO',
  PAYMENT_VOID_DEBIT = 'DEBITO_ANULACION_PAGO',
  SALE_VOID_CREDIT = 'CREDITO_ANULACION_VENTA',
}

export enum CommercialOutboxStatus {
  PENDING = 'PENDIENTE',
  PUBLISHED = 'PUBLICADO',
  ERROR = 'ERROR',
}

export enum CommercialReportType {
  SALES = 'VENTAS',
  PAYMENTS = 'PAGOS',
  RECEIVABLES = 'CUENTAS_POR_COBRAR',
  TRACEABILITY = 'TRAZABILIDAD',
}

export enum ReportFormat {
  CSV = 'CSV',
  PDF = 'PDF',
}
