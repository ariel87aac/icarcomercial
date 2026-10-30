# Cuarta iteración: preparación, despacho y distribución

## Alcance

La cuarta iteración toma pedidos `CONFIRMADO`, registra su preparación individual y organiza su distribución mediante vehículos, responsables y rutas por fecha y zona. La salida de una ruta consume las reservas, descuenta la existencia física y registra movimientos de inventario. El responsable asignado registra el resultado de cada visita y, al finalizar el recorrido, Distribución realiza una liquidación exclusivamente operativa de las devoluciones aceptadas.

Esta iteración no implementa seguimiento GPS, optimización automática de recorridos, seguimiento público, WhatsApp, pagos, comprobantes ni saldos por cobrar.

## Flujo operativo

La preparación utiliza los estados:

```text
PENDIENTE → EN_PREPARACION u OBSERVADA → PREPARADA → ASIGNADA → DESPACHADA
       └───────────────────────────────────────→ CANCELADA
```

- Solo un pedido `CONFIRMADO` sin preparación **no cancelada** es elegible. Una preparación despachada sigue bloqueando cualquier duplicado.
- La cantidad preparada no puede superar la solicitada.
- La confirmación tampoco permite separar más unidades que la existencia física asignable, aunque la reserva sea mayor.
- Cada detalle debe verificarse y toda diferencia requiere observación antes de confirmar.
- El modal inicia **Cantidad a entregar** con la cantidad solicitada y no habilita **Preparar** hasta que todos los productos estén verificados.
- Una preparación confirmada pasa de la cola **Preparar** a **Despachar**.
- **Editar** reabre la preparación, elimina las verificaciones anteriores y exige verificarlas nuevamente.
- **Entregar** registra el traspaso de Almacén a Distribución sin disminuir la existencia; el descuento continúa ocurriendo únicamente al registrar la salida de la ruta.
- Una preparación confirmada solo puede pertenecer a una ruta.
- Una preparación no asignada ni despachada puede cancelarse con motivo obligatorio; la reserva del pedido se conserva y el pedido puede iniciar una nueva preparación.

La ruta utiliza los estados:

```text
BORRADOR → PLANIFICADA → EN_REPARTO → FINALIZADA → LIQUIDADA
    └─────────────────────→ CANCELADA
```

- La ruta se crea para una fecha, zona, vehículo activo y uno o más responsables; exactamente uno es principal.
- Todo vehículo nuevo requiere una **capacidad máxima en kg** mayor que cero.
- La carga de una ruta es la suma de `cantidad preparada × peso en kg de la presentación` para todos sus productos.
- Si falta el peso de alguna presentación, la ruta identifica cuáles deben configurarse y no permite planificar.
- Si la carga supera la capacidad, la interfaz muestra carga, capacidad y excedente; la planificación y la salida quedan bloqueadas.
- Mientras la ruta está en `BORRADOR`, Distribución puede asignar otro vehículo activo con capacidad suficiente. El cambio queda en historial y auditoría.
- Una ruta `BORRADOR` o `PLANIFICADA` puede reprogramar su fecha operativa con motivo obligatorio, sin modificar la fecha de entrega comprometida del pedido.
- Una ruta sin salida puede cancelarse con motivo obligatorio. Sus preparaciones regresan a `PREPARADA`, quedan disponibles para otra ruta y la bitácora conserva el detalle de las entregas retiradas.
- La secuencia de entregas se define manualmente con posiciones únicas y consecutivas.
- La planificación requiere domicilios con coordenadas válidas.
- La salida consume reservas y registra `SALIDA_DESPACHO` dentro de la misma transacción.
- Toda visita queda como `ENTREGADA`, `ENTREGA_PARCIAL` o `NO_ENTREGADA` y conserva cantidades entregadas y devueltas.
- `ADMINISTRADOR` y `COMERCIALIZACION` consultan todos los repartos activos y pueden registrar el resultado de cualquier entrega. El repartidor continúa limitado a las rutas donde fue asignado.
- La liquidación acepta devoluciones y registra `ENTRADA_DEVOLUCION`; no registra operaciones financieras.

## Matriz de permisos

| Rol | Preparación | Vehículos y rutas | Visitas | Liquidación y consulta |
| --- | --- | --- | --- | --- |
| `ADMINISTRADOR` | Gestión completa | Gestión completa y consulta todos los repartos activos | Registra cualquier entrega | Gestión completa |
| `COMERCIALIZACION` | Sin gestión de preparación | Consulta todos los repartos activos | Registra cualquier entrega | Consulta del resumen |
| `ALMACEN` | Inicia, registra avance, confirma y cancela | Consulta | Sin registro | Consulta e historial |
| `DISTRIBUCION` | Consulta | Gestiona vehículos, rutas, secuencia, planificación y salida | Sin registro | Finaliza, liquida y consulta |
| `REPARTIDOR` | Sin acceso | Consulta sus rutas asignadas | Registra resultados | Consulta historial y resumen |
| `GERENCIA` | Consulta | Consulta | Sin registro | Consulta historial y resumen |

Los permisos incorporados son:

- `preparations.read`, `preparations.create`, `preparations.progress`, `preparations.confirm`
- `preparations.cancel`, `preparations.handoff`
- `vehicles.read`, `vehicles.manage`
- `distribution.routes.read`, `distribution.routes.create`, `distribution.routes.plan`
- `distribution.routes.departure`, `distribution.routes.assigned.read`
- `distribution.visits.create`, `distribution.routes.finish`, `distribution.routes.settle`
- `distribution.history.read`, `distribution.summary.read`
- `distribution.routes.reschedule`, `distribution.routes.cancel`
- `distribution.weights.read`, `distribution.weights.manage`

## Rutas de la API

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/preparations/eligible` | Consulta pedidos confirmados elegibles. |
| `GET` | `/api/preparations/work-queue` | Consulta en una sola cola pedidos por iniciar y preparaciones en curso. |
| `GET` | `/api/preparations` | Consulta preparaciones con filtros. |
| `POST` | `/api/preparations` | Inicia una preparación. |
| `GET` | `/api/preparations/:id` | Consulta cantidades, diferencias e historial. |
| `POST` | `/api/preparations/:id/progress` | Registra cantidades preparadas, verificación y observación. |
| `POST` | `/api/preparations/:id/confirm` | Confirma la preparación. |
| `POST` | `/api/preparations/:id/reopen` | Reabre una preparación y exige verificar nuevamente todos sus productos. |
| `POST` | `/api/preparations/:id/handoff` | Registra el traspaso de la preparación a Distribución. |
| `POST` | `/api/preparations/:id/cancel` | Cancela una preparación no asignada con motivo obligatorio. |
| `GET` | `/api/preparations/:id/history` | Consulta el historial de preparación. |
| `GET` | `/api/vehicles` | Consulta vehículos. |
| `POST` | `/api/vehicles` | Registra un vehículo. |
| `PATCH` | `/api/vehicles/:id` | Actualiza un vehículo o su estado. |
| `GET` | `/api/distribution-routes` | Consulta rutas por fecha, zona, vehículo o estado. |
| `GET` | `/api/distribution-routes/pending-deliveries` | Consulta los pedidos recibidos de Almacén que todavía no pertenecen a una ruta. |
| `POST` | `/api/distribution-routes` | Crea una ruta y asigna recursos. |
| `GET` | `/api/distribution-routes/:id` | Consulta entregas, secuencia, responsables e historial. |
| `POST` | `/api/distribution-routes/:id/deliveries` | Agrega preparaciones confirmadas a una ruta. |
| `DELETE` | `/api/distribution-routes/:id/deliveries/:deliveryId` | Retira una entrega de una ruta en Borrador y libera su preparación. |
| `PUT` | `/api/distribution-routes/:id/vehicle` | Cambia el vehículo de una ruta en Borrador, validando disponibilidad y capacidad. |
| `PUT` | `/api/distribution-routes/:id/sequence` | Guarda la secuencia manual. |
| `PUT` | `/api/distribution-routes/:id/reschedule` | Reprograma la fecha operativa antes de la salida y exige motivo. |
| `POST` | `/api/distribution-routes/:id/cancel` | Cancela una ruta antes de la salida y devuelve sus preparaciones. |
| `GET` | `/api/distribution-routes/weight-readiness` | Lista presentaciones y detecta pesos pendientes con paginación. |
| `PUT` | `/api/distribution-routes/presentation-weights` | Registra pesos reales por presentación con auditoría. |
| `POST` | `/api/distribution-routes/:id/plan` | Planifica una ruta. |
| `POST` | `/api/distribution-routes/:id/departure` | Registra la salida y el despacho de inventario. |
| `GET` | `/api/distribution-routes/my-route` | Consulta rutas activas del responsable autenticado. |
| `POST` | `/api/route-deliveries/:id/result` | Registra el resultado de una visita. |
| `POST` | `/api/distribution-routes/:id/finish` | Finaliza una ruta con todas sus visitas registradas. |
| `POST` | `/api/distribution-routes/:id/settlement` | Registra la liquidación operativa y devoluciones aceptadas. |
| `GET` | `/api/inventario/retornos-ruta` | Lista órdenes de retorno pendientes en Almacén. |
| `POST` | `/api/inventario/retornos-ruta/:id/receive` | Recibe devoluciones, registra el ingreso y liquida la ruta. |
| `GET` | `/api/distribution-routes/:id/history` | Consulta la bitácora de la ruta. |
| `GET` | `/api/distribution-routes/summary` | Consulta el resumen operativo. |

## Persistencia e integridad

La migración `1720000005000-create-iteration-four.ts` crea:

- `preparaciones_pedido`, `preparaciones_detalle`, `preparaciones_historial`
- `vehiculos`
- `rutas_distribucion`, `rutas_responsables`, `rutas_entregas`, `rutas_historial`
- `resultados_visita`, `resultados_visita_detalle`
- `liquidaciones_ruta`

También extiende inventario con los movimientos `SALIDA_DESPACHO` y `ENTRADA_DEVOLUCION`, el estado de reserva `CONSUMIDA` y las referencias al pedido, detalle y entrega de ruta.

La migración `1720000017000-add-route-weight-capacity.ts` incorpora `peso_kg` en cada presentación y el evento de ruta `CAMBIO_VEHICULO`. Para productos cuya unidad base es kilogramo, el dato histórico se inicializa desde el factor de conversión; las demás presentaciones deben completarse desde Productos antes de planificar una ruta.

La migración `1720000039000-harden-preparation-distribution.ts` incorpora cancelación y reprogramación auditadas, instantáneas de existencia física y faltante, permisos específicos y una unicidad parcial que permite reiniciar solo las preparaciones canceladas. El valor disponible puede ser negativo para hacer visible la demanda que todavía debe cubrir Producción.

La migración `1720000040000-add-preparation-handoff-workflow.ts` incorpora los eventos `REAPERTURA` y `ENTREGA_DISTRIBUCION`, registra usuario y fecha del traspaso y añade el permiso `preparations.handoff`. El traspaso es independiente de la salida de ruta para impedir descuentos anticipados de inventario.

La migración `1720000043000-grant-commercial-delivery-control.ts` asigna a `COMERCIALIZACION` los permisos de consulta de repartos activos, registro de visitas y resumen. La consulta de repartos mantiene el filtro por responsable para `REPARTIDOR`, pero utiliza alcance global para `ADMINISTRADOR` y `COMERCIALIZACION`.

La migración `1720000044000-add-warehouse-returns-and-automatic-sales.ts` separa la finalización del recorrido de la recepción física. Si existe producto no entregado, la finalización crea una orden de retorno pendiente; Almacén verifica sus líneas y recién entonces registra `ENTRADA_DEVOLUCION` y cambia la ruta a `LIQUIDADA`.

Las operaciones críticas bloquean los registros involucrados y se ejecutan en transacciones. Esto impide preparar dos veces el mismo pedido, asignar una preparación a dos rutas, repetir la salida, consumir una reserva dos veces o aceptar una devolución sin su movimiento de entrada. Los cambios de estado, responsables y fechas quedan en historial y auditoría.

## Relación con el ajuste de Producción

La tercera iteración separa la demanda cubierta por reservas, el faltante, la **Solicitud para stock** de Comercial y el **Ajuste por batch/capacidad** de Producción. Tanto la orden como la entrega de Producción y la recepción de Almacén operan sobre la misma presentación. Preparación sólo utiliza el saldo después de que Almacén acepta la entrega y registra `INGRESO_PRODUCCION`.

Actualización del 29 de octubre de 2026: si falta cobertura, el pedido permanece **En preparación**. Puede consultarse y registrarse una observación, pero no se confirma ni se entrega a Distribución una preparación incompleta. La confirmación exige todas las cantidades y verificaciones; la cobertura actual respeta la prioridad por fecha de creación del pedido.

La cobertura actual asigna el físico por fecha de creación del pedido, conservando lo ya separado. Esta asignación dinámica no sobrescribe las fuentes históricas de Producción. La etapa pública **Preparado** corresponde al traspaso a Distribución; el estado interno PREPARADA conserva la verificación y protección de unidades. Véase [Flujo unificado](./implementacion-flujo-unificado-pedidos.md).

## Interfaz

La preparación se encuentra en **Almacén > Preparación**, junto a existencias, movimientos, alertas y recepciones. **Distribución** contiene Vehículos, Pesos de carga, Rutas, Repartos activos/Mi reparto y Resumen según permisos. Para Administrador y Comercialización, **Repartos activos** muestra todas las rutas planificadas o en reparto y permite abrir una entrega para marcarla como entregada, parcial o no entregada. Para Repartidor, **Mi reparto** conserva únicamente sus rutas asignadas. Las listas principales usan búsqueda dinámica y paginación del servidor con 25 registros por defecto.

En Vehículos, el alta y la edición exigen la capacidad máxima en kg. En Pesos de carga se muestran primero las presentaciones pendientes y se registran valores reales en bloque; el sistema no inventa ni estima pesos. En Rutas se muestra `carga / capacidad`, el excedente o margen disponible y, en Borrador, un selector para cambiar de vehículo. La fecha operativa de la ruta se diferencia de la fecha de entrega comprometida del pedido. Los mapas muestran los puntos de entrega y permiten alternar entre OpenStreetMap y vista satélite. El orden visible corresponde a la secuencia manual guardada; no se calcula una ruta óptima.

En **Almacén > Preparación** la interfaz se divide en dos tablas. **Preparar** muestra pedidos confirmados por iniciar y preparaciones incompletas. **Despachar** muestra pedidos preparados listos para transferir a Distribución y ofrece **Editar**, **Entregar** y **Cancelar**.

El modal muestra Cod-Producto, Nombre, Stock disponible, Solicitado, Cantidad a entregar, Diferencia, Verificado y Observación. La cantidad editable inicia con la solicitada; los faltantes se resaltan y toda diferencia exige observación. **Preparar** permanece deshabilitado hasta verificar todos los productos. En pantallas móviles las filas se presentan como tarjetas, los controles de cantidad admiten interacción táctil y las acciones se mantienen visibles.

**Distribución > Pedidos pendientes** es la bandeja de recepción operativa. Lista únicamente preparaciones entregadas por Almacén y todavía no asignadas, con filtros por búsqueda, fecha comprometida y zona. La selección calcula productos y peso, exige una sola zona y compara la carga con el vehículo. **Crear ruta con seleccionados** guarda la ruta, sus responsables, las entregas y su secuencia inicial dentro de una sola transacción; ante cualquier inconsistencia no deja una ruta parcial.

El recuadro **Flujo operativo** se retiró de Pedidos para evitar una vista duplicada. El **Resumen** principal concentra ahora el flujo Pedidos → Producción → Preparación → Distribución, muestra el detalle y total de trabajos pendientes según los permisos efectivos del usuario y permite abrir directamente cada módulo. El endpoint `GET /api/dashboard/operational-summary` calcula estos datos desde los estados operativos reales; para usuarios cliente mantiene el alcance restringido a sus propios pedidos.

## Pruebas

La suite `backend/scripts/iteration-four.acceptance.mjs` valida 46 reglas de aceptación. Además de los casos originales, comprueba bloqueo posterior al despacho, faltantes negativos y recepciones relacionadas, límite físico al confirmar, reprogramación, cancelación de ruta, cancelación y reinicio de preparación, pesos auditados, paginación real, cola unificada de trabajo, reapertura con nueva verificación, traspaso auditado a Distribución, consolidación de pendientes, creación transaccional de rutas, entrega parcial, rechazo, retorno a Almacén, entrega directa en fábrica y emisión automática de la nota de venta.

La matriz ampliada y los controles visuales están documentados en [Pruebas de aceptación: refactor de Preparación y Distribución](./pruebas-aceptacion-preparacion-distribucion-refactor.md).

La nota completa de entrega, el rechazo del cliente y el retorno pendiente se detallan en [Pruebas de aceptación: entrega, retorno, venta y cobranza](./pruebas-aceptacion-entrega-ventas-retornos.md).

Con el stack en ejecución:

```bash
docker compose run --rm backend npm run test:acceptance:iteration4
```
