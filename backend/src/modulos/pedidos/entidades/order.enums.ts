export enum OrderStatus {
  DRAFT = 'BORRADOR',
  RECEIVED = 'RECIBIDO',
  CONFIRMED = 'CONFIRMADO',
  CANCELED = 'CANCELADO',
}

export enum OrderOrigin {
  PORTAL = 'PORTAL',
  INTERNAL = 'INTERNO',
}

export enum OrderConfirmationLinkStatus {
  ACTIVE = 'ACTIVO',
  USED = 'USADO',
  EXPIRED = 'EXPIRADO',
  REVOKED = 'REVOCADO',
}
