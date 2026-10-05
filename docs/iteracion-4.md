# Cuarta iteración: preparación, despacho y distribución

## Alcance

La cuarta iteración toma pedidos `CONFIRMADO`, registra su preparación individual y organiza su distribución mediante vehículos, responsables y rutas por fecha y zona. La salida de una ruta consume las reservas, descuenta la existencia física y registra movimientos de inventario. El responsable asignado registra el resultado de cada visita y, al finalizar el recorrido, Distribución realiza una liquidación exclusivamente operativa de las devoluciones aceptadas.

Esta iteración no implementa seguimiento GPS, optimización automática de recorridos, seguimiento público, WhatsApp, pagos, comprobantes ni saldos por cobrar.

## Flujo operativo

La preparación utiliza los estados:

```text
PENDIENTE → EN_PREPARACION u OBSERVADA → PREPARADA → ASIGNADA → DESPACHADA
```

- Solo un pedido `CONFIRMADO` sin preparación activa es elegible.
- La cantidad preparada no puede superar la solicitada.
- Cada detalle debe verificarse y toda diferencia requiere observación antes de confirmar.
- Una preparación confirmada solo puede pertenecer a una ruta.

La ruta utiliza los estados:

```text
BORRADOR → PLANIFICADA → EN_REPARTO → FINALIZADA → LIQUIDADA
```

- La ruta se crea para una fecha, zona, vehículo activo y uno o más responsables; exactamente uno es principal.
- La secuencia de entregas se define manualmente con posiciones únicas y consecutivas.
- La planificación requiere domicilios con coordenadas válidas.
- La salida consume reservas y registra `SALIDA_DESPACHO` dentro de la misma transacción.
- Toda visita queda como `ENTREGADA`, `ENTREGA_PARCIAL` o `NO_ENTREGADA` y conserva cantidades entregadas y devueltas.
- La liquidación acepta devoluciones y registra `ENTRADA_DEVOLUCION`; no registra operaciones financieras.

## Matriz de permisos

| Rol | Preparación | Vehículos y rutas | Visitas | Liquidación y consulta |
| --- | --- | --- | --- | --- |
| `ADMINISTRADOR` | Gestión completa | Gestión completa | Según asignación | Gestión completa |
| `ALMACEN` | Inicia, registra avance y confirma | Consulta | Sin registro | Consulta e historial |
| `DISTRIBUCION` | Consulta | Gestiona vehículos, rutas, secuencia, planificación y salida | Sin registro | Finaliza, liquida y consulta |
| `REPARTIDOR` | Sin acceso | Consulta sus rutas asignadas | Registra resultados | Consulta historial y resumen |
| `GERENCIA` | Consulta | Consulta | Sin registro | Consulta historial y resumen |

Los permisos incorporados son:

- `preparations.read`, `preparations.create`, `preparations.progress`, `preparations.confirm`
- `vehicles.read`, `vehicles.manage`
- `distribution.routes.read`, `distribution.routes.create`, `distribution.routes.plan`
- `distribution.routes.departure`, `distribution.routes.assigned.read`
- `distribution.visits.create`, `distribution.routes.finish`, `distribution.routes.settle`
- `distribution.history.read`, `distribution.summary.read`

## Rutas de la API

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/preparations/eligible` | Consulta pedidos confirmados elegibles. |
| `GET` | `/api/preparations` | Consulta preparaciones con filtros. |
| `POST` | `/api/preparations` | Inicia una preparación. |
| `GET` | `/api/preparations/:id` | Consulta cantidades, diferencias e historial. |
| `POST` | `/api/preparations/:id/progress` | Registra cantidades preparadas, verificación y observación. |
| `POST` | `/api/preparations/:id/confirm` | Confirma la preparación. |
| `GET` | `/api/preparations/:id/history` | Consulta el historial de preparación. |
| `GET` | `/api/vehicles` | Consulta vehículos. |
| `POST` | `/api/vehicles` | Registra un vehículo. |
| `PATCH` | `/api/vehicles/:id` | Actualiza un vehículo o su estado. |
| `GET` | `/api/distribution-routes` | Consulta rutas por fecha, zona, vehículo o estado. |
| `POST` | `/api/distribution-routes` | Crea una ruta y asigna recursos. |
| `GET` | `/api/distribution-routes/:id` | Consulta entregas, secuencia, responsables e historial. |
| `POST` | `/api/distribution-routes/:id/deliveries` | Agrega preparaciones confirmadas a una ruta. |
| `PUT` | `/api/distribution-routes/:id/sequence` | Guarda la secuencia manual. |
| `POST` | `/api/distribution-routes/:id/plan` | Planifica una ruta. |
| `POST` | `/api/distribution-routes/:id/departure` | Registra la salida y el despacho de inventario. |
| `GET` | `/api/distribution-routes/my-route` | Consulta rutas activas del responsable autenticado. |
| `POST` | `/api/route-deliveries/:id/result` | Registra el resultado de una visita. |
| `POST` | `/api/distribution-routes/:id/finish` | Finaliza una ruta con todas sus visitas registradas. |
| `POST` | `/api/distribution-routes/:id/settlement` | Registra la liquidación operativa y devoluciones aceptadas. |
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

Las operaciones críticas bloquean los registros involucrados y se ejecutan en transacciones. Esto impide preparar dos veces el mismo pedido, asignar una preparación a dos rutas, repetir la salida, consumir una reserva dos veces o aceptar una devolución sin su movimiento de entrada. Los cambios de estado, responsables y fechas quedan en historial y auditoría.

## Interfaz

La pantalla **Preparación y distribución** contiene las vistas Preparación, Vehículos, Rutas, Mi reparto y Resumen según permisos. Los mapas muestran los puntos de entrega y permiten alternar entre OpenStreetMap y vista satélite. El orden visible corresponde a la secuencia manual guardada; no se calcula una ruta óptima.

## Pruebas

La suite `backend/scripts/iteration-four.acceptance.mjs` valida 16 reglas de aceptación: elegibilidad y unicidad de preparación, cantidades y diferencias, observaciones, confirmación, asignación única, secuencia, coordenadas, salida transaccional, concurrencia, alcance del repartidor, resultado de visita, liquidación sin datos financieros e historial cronológico.

Con el stack en ejecución:

```bash
docker compose run --rm backend npm run test:acceptance:iteration4
```
