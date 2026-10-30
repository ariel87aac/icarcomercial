# Sexta iteración: ventas, cobros y cuentas por cobrar

La sexta iteración implementa exclusivamente el alcance de la sección 3.7 de la documentación actualizada: generación de ventas desde entregas efectivas, comprobante interno, registro y confirmación de cobros, estado de cuenta, cartera, reportes y notificación de cobro recibido.

## Reglas implementadas

- Una venta se genera únicamente desde una visita con resultado `ENTREGADA` o `ENTREGA_PARCIAL` y usa las cantidades efectivamente entregadas.
- Cada venta recibe un `Cod-Venta` numérico, automático e incremental desde 1. La consulta principal se ordena por este código de mayor a menor.
- El detalle de venta, el comprobante interno, las aplicaciones de pago y los movimientos de cuenta referencian a la venta mediante `Cod-Venta`; el UUID queda reservado para identificar recursos en la API.
- El registro de la visita y la emisión de la venta se confirman en la misma transacción; ya no requieren una acción manual separada en la interfaz.
- La entrega directa en fábrica utiliza la misma regla: no crea recorrido ni asigna vehículo, pero registra la entrega efectiva y emite automáticamente la venta y cuenta pendiente.
- El precio se copia del detalle histórico del pedido. Los importes se calculan a dos decimales sin recalcular precios posteriores.
- Solo puede existir una venta no anulada por pedido y resultado de visita.
- La fecha de vencimiento se calcula desde la fecha de emisión y los días de crédito copiados del cliente. Para `CONTADO` vence el mismo día.
- Un cliente `CONTADO` con saldo pendiente no puede originar una nueva venta hasta que su pago sea confirmado; el rechazo revierte toda la transacción de la visita.
- El comprobante usa serie y correlativo bloqueados dentro de la misma transacción e incluye la leyenda `DOCUMENTO INTERNO ICAR - NO CONSTITUYE FACTURA TRIBUTARIA`.
- La interfaz funcional se denomina **Cobros**. Su primera tabla agrupa la deuda por cliente, muestra cantidad de notas, monto total, vencidos y vencimiento más antiguo; cualquier deuda vencida se resalta en rojo.
- Al seleccionar el nombre del cliente se abre la cobranza con dos modalidades: un abono definido que se aplica desde la nota más antigua, o la selección de una o varias notas completas.
- El cobro se registra primero como `REGISTRADO`. La suma de aplicaciones debe coincidir exactamente con su importe, sin anticipos ni saldos a favor.
- La confirmación del cobro bloquea cliente, cobro y ventas; actualiza aplicaciones, saldos, estados, historial, cuenta corriente y evento de salida en una sola transacción.
- Las anulaciones generan contramovimientos y conservan la trazabilidad; no eliminan físicamente operaciones comerciales.
- El evento `payment.received` se publica después del commit. Un fallo de mensajería no revierte el pago y puede reintentarse desde el outbox.
- El cliente autenticado solo puede consultar sus ventas, cobros, comprobantes y estado de cuenta propios.

## Estados

- Venta: `BORRADOR`, `EMITIDA`, `PAGO_PARCIAL`, `PAGADA`, `ANULADA`.
- Cobro: `REGISTRADO`, `CONFIRMADO`, `ANULADO`.
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
| `GET` | `/api/payments/collection-customers` | Agrupar clientes, deuda, notas pendientes y vencimientos |
| `POST` | `/api/payments` | Registrar cobro por monto o por notas seleccionadas |
| `POST` | `/api/payments/:id/confirm` | Confirmar y aplicar cobro |
| `POST` | `/api/payments/:id/void` | Anular cobro con contramovimientos |
| `GET` | `/api/customers/:id/account` | Estado de cuenta autorizado |
| `GET` | `/api/me/account` | Estado de cuenta propio |
| `GET` | `/api/receivables` | Cartera y antigüedad de saldos |
| `GET` | `/api/reports/commercial/:type` | Reportes de ventas, cobros, cartera o trazabilidad |
| `GET` | `/api/reports/commercial/:type/export` | Exportación CSV o PDF |

## Persistencia

La migración `1720000010000-create-iteration-six.ts` crea ventas y detalle, series y comprobantes, medios de pago, pagos y aplicaciones, historial, movimientos de cuenta y el outbox comercial. También vincula opcionalmente una notificación con el pago que la originó.

La migración incremental `1720000044000-add-warehouse-returns-and-automatic-sales.ts` integra la emisión automática con Distribución y agrega la recepción trazable de retornos en Almacén.

Las migraciones incrementales `1720000045000-add-factory-delivery.ts` y `1720000046000-grant-factory-delivery.ts` incorporan la modalidad `FABRICA` para entregas sin ruta ni vehículo, conservan el resultado como origen de la venta y habilitan la operación al rol Distribución.

La migración incremental `1720000047000-add-sale-code-and-relations.ts` numera los registros existentes desde 1, configura la secuencia `ventas_codigo_seq` y migra las relaciones comerciales desde el UUID hacia `venta_codigo`, con claves foráneas e índices.

La migración incremental `1720000048000-add-collection-code-and-relations.ts` incorpora `Cod-Cobro` numérico e incremental desde 1 en la tabla física `pagos`. Las aplicaciones, historial, outbox y notificaciones pasan a relacionarse mediante `pago_codigo`; el UUID permanece como identificador técnico de los recursos REST. También agrega la observación del cobro.

## Verificación

```bash
docker compose exec backend npm run test:acceptance:iteration6
```

La aceptación cubre permisos, medios de pago, emisión única, correlativos `Cod-Venta` y `Cod-Cobro`, relaciones numéricas, PDF interno, cobro registrado y confirmado, agrupación de clientes por cobrar, aplicación automática a la nota más antigua, estado de cuenta, cartera, exportaciones, anulaciones por contramovimiento y el evento `payment.received`. Durante la prueba se desactiva temporalmente el canal de WhatsApp para no enviar mensajes reales y se restaura al terminar.

Los casos incrementales CP-156 a CP-169 están documentados en [Pruebas de aceptación: entrega, retorno, venta y cobranza](./pruebas-aceptacion-entrega-ventas-retornos.md).

Quedan fuera de alcance la facturación tributaria/electrónica, impuestos, pasarela de pago, conciliación bancaria, cuentas por pagar, contabilidad general, notas de crédito fiscales, anticipos y multimoneda.
