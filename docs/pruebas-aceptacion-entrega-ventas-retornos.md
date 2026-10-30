# Pruebas de aceptación: entrega, retorno, venta y cobranza

## Objetivo

Validar el recorrido integrado desde la nota de entrega utilizada por el responsable de reparto hasta la recepción de devoluciones en Almacén y la generación de la cuenta por cobrar. El cambio complementa la cuarta y la sexta iteración sin incorporar facturación tributaria, impuestos, anticipos ni conciliación bancaria.

## Reglas verificables

- La nota de entrega muestra pedido, cliente, domicilio, fecha, condición comercial y todos los productos preparados.
- El responsable puede entregar las cantidades completas o reducir cada cantidad. La diferencia se convierte en retorno y exige observación.
- El rechazo del cliente registra `NO_ENTREGADA`, devuelve toda la carga y no genera una venta.
- Una entrega `ENTREGADA` o `ENTREGA_PARCIAL` genera, en la misma transacción, una nota de venta `EMITIDA`, su detalle histórico, comprobante interno y débito pendiente.
- La venta usa cantidades efectivamente entregadas y los precios copiados del pedido.
- Un cliente `CREDITO` conserva los días de crédito vigentes al emitir la venta. Un cliente `CONTADO` recibe vencimiento inmediato.
- Un cliente `CONTADO` con una venta `EMITIDA` o `PAGO_PARCIAL` y saldo mayor que cero no puede originar otra venta.
- Al finalizar una ruta con cantidades devueltas se crea una orden de retorno `PENDIENTE`; las existencias no cambian todavía.
- Almacén verifica todos los productos del retorno. La cantidad aceptada registra `ENTRADA_DEVOLUCION`, liquida la ruta y conserva cualquier diferencia con observación.
- Desde Pedidos pendientes se elige entre **Enviar a reparto** y **Entrega en fábrica**. La entrega en fábrica no crea ruta, no asigna vehículo y usa la misma nota completa.
- En una entrega parcial o rechazada en fábrica sólo sale de existencia lo efectivamente retirado; la diferencia nunca abandona Almacén y, por tanto, no genera una orden de retorno.
- La entrega en fábrica completa o parcial genera la nota de venta con las mismas reglas de contado, crédito, vencimiento y bloqueo por saldo.

## Matriz de aceptación

| Caso | Acción | Resultado esperado | Tipo |
| --- | --- | --- | --- |
| CP-156 | Confirmar una entrega completa para cliente Contado. | Se registra la visita y se genera automáticamente la nota de venta, el comprobante, el débito y el vencimiento en la fecha de emisión. | Automatizada |
| CP-157 | Abrir una visita desde un teléfono. | La nota completa muestra cabecera, productos, solicitado, preparado, precio, cantidad editable, retorno y subtotal. | Manual |
| CP-158 | Reducir una o más cantidades y explicar el motivo. | La visita queda `ENTREGA_PARCIAL`; la venta contiene sólo lo entregado y la diferencia queda como retorno. | Automatizada; presentación visual manual |
| CP-159 | Rechazar el pedido indicando motivo. | La visita queda `NO_ENTREGADA`, toda la cantidad queda devuelta y no se crea venta. | Automatizada; presentación visual manual |
| CP-160 | Intentar confirmar otra entrega de un cliente Contado con saldo pendiente. | La transacción se rechaza; no quedan resultado de visita, venta ni movimientos parciales. | Automatizada |
| CP-161 | Confirmar una entrega para cliente Crédito. | La fecha de vencimiento es emisión más los días de crédito copiados del cliente. | Automatizada |
| CP-162 | Finalizar una ruta con devolución. | Se crea una sola orden de retorno pendiente y no cambia la existencia física. | Automatizada |
| CP-163 | Abrir **Almacén → Recepciones**. | Los retornos de Distribución aparecen separados de las entregas de Producción, con ruta, vehículo, productos y cantidad. | Manual |
| CP-164 | Recepcionar el retorno completo. | Cada producto aumenta la existencia, se crea `ENTRADA_DEVOLUCION`, la orden queda `RECIBIDA` y la ruta `LIQUIDADA`. | Automatizada |
| CP-165 | Recepcionar una cantidad diferente sin observación y luego con motivo. | El primer intento se rechaza; el segundo registra sólo lo aceptado y conserva el motivo. | Automatizada |
| CP-166 | Repetir la recepción o la emisión para la misma entrega. | La API rechaza la duplicidad sin alterar saldos. | Automatizada |
| CP-167 | Seleccionar un pedido preparado y elegir **Entrega en fábrica**. | Se registra la entrega sin ruta ni vehículo y se genera la nota de venta por lo entregado. | Automatizada; presentación visual manual |
| CP-168 | Reducir la cantidad retirada en fábrica. | La venta usa la cantidad efectiva, el inventario descuenta sólo lo retirado y la diferencia permanece disponible. | Automatizada |
| CP-169 | Intentar procesar nuevamente una preparación ya entregada en fábrica. | Se rechaza la duplicidad y el pedido no puede incorporarse posteriormente a una ruta. | Automatizada |

## API incorporada

| Método | Ruta | Uso |
| --- | --- | --- |
| `GET` | `/api/inventario/retornos-ruta` | Consultar órdenes de retorno con filtros y paginación. |
| `GET` | `/api/inventario/retornos-ruta/:id` | Consultar productos y cantidades de una orden. |
| `POST` | `/api/inventario/retornos-ruta/:id/receive` | Verificar el retorno, ingresar existencias y liquidar la ruta. |
| `POST` | `/api/entregas-fabrica` | Registrar atómicamente la entrega directa, el movimiento de inventario y la nota de venta. |

`POST /api/route-deliveries/:id/result` conserva su contrato operativo, pero para resultados completos o parciales devuelve además `generatedSale` con número, total y vencimiento.

## Persistencia y auditoría

La migración `1720000044000-add-warehouse-returns-and-automatic-sales.ts` crea `ordenes_retorno_almacen` y `ordenes_retorno_almacen_detalle`, agrega los permisos `inventory.returns.read` e `inventory.returns.receive` y los asigna a Administrador y Almacén. La migración `1720000045000-add-factory-delivery.ts` diferencia `REPARTO` y `FABRICA` y permite que una entrega de fábrica no tenga ruta; `1720000046000-grant-factory-delivery.ts` habilita esta operación al rol Distribución. Los eventos `EMITIR_VENTA_AUTOMATICA`, `GENERAR_ORDEN_RETORNO_ALMACEN`, `RECIBIR_RETORNO_ALMACEN` y `REGISTRAR_ENTREGA_FABRICA` conservan actor, origen y cantidades.

## Evidencia requerida

1. Salida de la suite de cuarta iteración con CP-156, CP-158, CP-159, CP-160, CP-161, CP-162, CP-164, CP-166, CP-167, CP-168 y CP-169 aprobados.
2. Captura móvil de la nota de entrega completa y de un rechazo con motivo.
3. Captura de la orden pendiente en Recepciones de Almacén.
4. Captura de la nota de venta y de la cuenta por cobrar creada desde la entrega.
5. Consulta de movimientos mostrando `SALIDA_DESPACHO` y el posterior `ENTRADA_DEVOLUCION` sin eliminar registros previos.
