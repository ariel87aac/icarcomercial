# Sexta iteración: ventas, pagos y cuentas por cobrar

La sexta iteración implementa exclusivamente el alcance de la sección 3.7 de la documentación actualizada: generación de ventas desde entregas efectivas, comprobante interno, registro y confirmación de pagos, estado de cuenta, cartera, reportes y notificación de pago recibido.

## Reglas implementadas

- Una venta se genera únicamente desde una visita con resultado `ENTREGADA` o `ENTREGA_PARCIAL` y usa las cantidades efectivamente entregadas.
- El precio se copia del detalle histórico del pedido. Los importes se calculan a dos decimales sin recalcular precios posteriores.
- Solo puede existir una venta no anulada por pedido y resultado de visita.
- La fecha de vencimiento se calcula desde la fecha de emisión y los días de crédito copiados del cliente.
- El comprobante usa serie y correlativo bloqueados dentro de la misma transacción e incluye la leyenda `DOCUMENTO INTERNO ICAR - NO CONSTITUYE FACTURA TRIBUTARIA`.
- El pago se registra primero como `REGISTRADO`. La suma de aplicaciones debe coincidir exactamente con su importe, sin anticipos ni saldos a favor.
- La confirmación del pago bloquea cliente, pago y ventas; actualiza aplicaciones, saldos, estados, historial, cuenta corriente y evento de salida en una sola transacción.
- Las anulaciones generan contramovimientos y conservan la trazabilidad; no eliminan físicamente operaciones comerciales.
- El evento `payment.received` se publica después del commit. Un fallo de mensajería no revierte el pago y puede reintentarse desde el outbox.
- El cliente autenticado solo puede consultar sus ventas, pagos, comprobantes y estado de cuenta propios.

## Estados

- Venta: `BORRADOR`, `EMITIDA`, `PAGO_PARCIAL`, `PAGADA`, `ANULADA`.
- Pago: `REGISTRADO`, `CONFIRMADO`, `ANULADO`.
- Cartera: `VIGENTE`, `VENCIDA`, `SALDADA`.
- Antigüedad: vigente, 1–30, 31–60, 61–90 y más de 90 días.

## API REST

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/deliveries/sale-eligible` | Entregas que pueden originar venta |
| `POST` | `/api/sales` | Emitir venta y comprobante interno |
| `GET` | `/api/sales` | Consultar ventas según alcance |
| `GET` | `/api/sales/:id/voucher` | Consultar o descargar comprobante |
| `POST` | `/api/sales/:id/void` | Anular venta con motivo |
| `GET` | `/api/payment-methods` | Medios de pago activos |
| `POST` | `/api/payments` | Registrar pago y aplicaciones propuestas |
| `POST` | `/api/payments/:id/confirm` | Confirmar y aplicar pago |
| `POST` | `/api/payments/:id/void` | Anular pago con contramovimientos |
| `GET` | `/api/customers/:id/account` | Estado de cuenta autorizado |
| `GET` | `/api/me/account` | Estado de cuenta propio |
| `GET` | `/api/receivables` | Cartera y antigüedad de saldos |
| `GET` | `/api/reports/commercial/:type` | Reportes de ventas, pagos, cartera o trazabilidad |
| `GET` | `/api/reports/commercial/:type/export` | Exportación CSV o PDF |

## Persistencia

La migración `1720000010000-create-iteration-six.ts` crea ventas y detalle, series y comprobantes, medios de pago, pagos y aplicaciones, historial, movimientos de cuenta y el outbox comercial. También vincula opcionalmente una notificación con el pago que la originó.

## Verificación

```bash
docker compose exec backend npm run test:acceptance:iteration6
```

La aceptación cubre permisos, medios de pago, emisión única, PDF interno, pago registrado y confirmado, estado de cuenta, cartera, exportaciones, anulaciones por contramovimiento y el evento `payment.received`. Durante la prueba se desactiva temporalmente el canal de WhatsApp para no enviar mensajes reales y se restaura al terminar.

Quedan fuera de alcance la facturación tributaria/electrónica, impuestos, pasarela de pago, conciliación bancaria, cuentas por pagar, contabilidad general, notas de crédito fiscales, anticipos y multimoneda.
