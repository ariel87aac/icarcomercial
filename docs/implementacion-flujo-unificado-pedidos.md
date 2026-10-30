# Implementación del flujo unificado de pedidos y seguimiento

Fecha: 29 de octubre de 2026.

## Comportamiento implementado

La etapa operativa visible del pedido se obtiene de una única fuente compartida por Pedidos, Almacén, el Resumen y el seguimiento. Se conserva el estado comercial BORRADOR, RECIBIDO, CONFIRMADO o CANCELADO para no alterar contratos comerciales ni planes de Producción existentes.

```text
Borrador → Recibido → Aprobado
                         ↓
                 En preparación
                         ↓
              Disponible para preparar
                         ↓
                     Preparado → Asignado → En reparto → Entregado
```

Si todos los productos están cubiertos al aprobarse, se pasa directamente a Disponible para preparar. La entrega puede terminar en Entrega parcial o No entregado. La entrega directa en fábrica conserva su operación sin vehículo ni ruta. La finalización/liquidación de la ruta no sustituye el resultado individual del pedido.

## Reservas, cobertura y prioridad

Confirmar compromete toda la cantidad solicitada. El saldo global continúa siendo físico menos reservado y puede ser negativo. La vista `cobertura_pedidos` distribuye la existencia física entre reservas activas de pedidos confirmados por fecha de creación del pedido, del más antiguo al más reciente. La fecha de entrega y el orden de confirmación no determinan la prioridad. Ante fechas idénticas se utiliza el UUID del pedido y del detalle como desempate estable.

Las cantidades de preparaciones confirmadas o asignadas se consideran separadas y se conservan antes de distribuir el resto. Una preparación cancelada o reabierta libera esa separación; cancelar un pedido elegible libera la reserva. No se duplica la cobertura de una unidad entre pedidos. Las recepciones de Producción, ingresos, devoluciones y demás cambios de stock se reflejan en la misma cobertura.

Cada detalle expone `coveredQuantity`, `shortageQuantity` y `availability` (DISPONIBLE, STOCK_PARCIAL, PENDIENTE_STOCK; DESPACHADO cuando la reserva ya fue consumida). Una entrega despachada no vuelve a mostrar el faltante inicial de Producción como si todavía esperara stock. Un saldo global cero puede cubrir completamente el pedido. Los campos históricos `cantidad_reservada` y `cantidad_pendiente` del detalle conservan la instantánea original utilizada por Producción; la cobertura actual se consulta por separado y no reescribe órdenes emitidas.

## Preparación y traspaso

En preparación significa que falta cobertura en al menos un detalle. Disponible para preparar significa que todos están cubiertos. Almacén puede consultar los faltantes y verificar sus productos, pero no confirmar ni entregar una preparación incompleta.

Se mantiene la preparación interna PREPARADA para señalar la verificación terminada y proteger las unidades separadas. Hasta el traspaso, la etapa pública sigue siendo Disponible para preparar. La etapa pública Preparado se registra al entregar a Distribución. El descuento físico continúa ocurriendo en la salida de ruta o en la entrega directa en fábrica.

El Resumen distingue en preparación, disponibles para preparar y verificados pendientes de entregar a Distribución; no omite estos últimos del total.

## Persistencia transaccional e historial

Las modificaciones de pedidos, preparación, distribución, Producción e inventario usan `workflowTransaction`. Un bloqueo asesor transaccional común serializa las decisiones de un solo almacén, evitando carreras entre reservas y separación. Al finalizar la operación, las transiciones comerciales y la nueva etapa/turno quedan guardados en `actualizaciones_seguimiento` dentro de la misma transacción.

La vista `pedido_flujo_actual` deriva el estado actual desde cobertura, preparación, ruta y resultado de visita. El historial pertenece al pedido; `enlace_id` es opcional y renovar/revocar el acceso no elimina los eventos. Las transiciones repetidas son legítimas; una consulta o evento repetido sin cambios no agrega otra transición.

La migración importa los eventos comerciales, traspasos, asignaciones, despachos de ruta y resultados históricos que realmente existen. Registra una línea base del estado actual sin enviar mensajes retroactivos. No inventa horas históricas de cobertura que nunca se registraron.

El historial comercial original conserva su API. La pantalla Historial usa el nuevo `GET /api/pedidos/:id/workflow`, con el permiso `orders.history.read` y el alcance del pedido validado antes de consultar el recorrido completo.

## Enlace y turno de reparto

Se crea un enlace protegido al generar el borrador, con vigencia hasta 90 días después de la fecha más tardía entre creación y entrega solicitada. El mensaje de borrador mantiene además el enlace específico para revisar y confirmar el pedido. La confirmación pública ofrece acceso al seguimiento y a la solicitud de cambios.

La página de seguimiento muestra todos los cambios registrados y consulta automáticamente cada 10 segundos mientras está abierta. Durante el reparto:

```text
Turno actual = visitas anteriores sin resultado + 1
```

En una ruta de cinco pedidos, el cuarto muestra «Tu pedido es la entrega número 4» y «Tienes 3 pedidos antes del tuyo». Al resolver las visitas anteriores avanza 4 → 3 → 2 → próxima entrega. Una entrega parcial o fallida resuelve esa visita y deja de contar como parada pendiente. Resolver visitas posteriores no cambia el turno. Al registrar el resultado propio se sustituye el turno por el resultado.

La secuencia física del reparto es independiente de la prioridad de cobertura de stock.

## WhatsApp y checks por estado

Seguimiento y mensajería → Plantillas incluye un check independiente por estado/evento. Los nuevos eventos específicos son En preparación, Disponible para preparar, Preparado, Asignado y Entrega parcial. Se mantienen Borrador, Recibido, Confirmado, Cancelado, En reparto, Entregado, No entregado y eventos complementarios.

Por defecto se habilitan Borrador, Confirmado, En reparto y Entregado. El resto comienza deshabilitado; una configuración explícita ya existente se respeta. La asignación no dispara el mensaje «en camino»: ese aviso corresponde a la salida registrada.

Los mensajes incluyen el enlace; el de entrega incorpora la opción de solicitar modificación o cambio de productos. Las actualizaciones del turno se consultan en el enlace, sin generar un WhatsApp por cada parada.

La preferencia de envío es independiente de la activación/versión de las plantillas. Crear plantillas base no reactiva un check desmarcado. Para los nuevos eventos operativos, deshabilitar en el momento del cambio evita su envío retroactivo si se habilita después. Los mensajes ya en la cola conservan la política de envío existente; el reenvío manual y las pruebas manuales del canal siguen siendo acciones explícitas separadas.

Las transiciones operativas conservan una marca de notificación pendiente para recuperarse después de un fallo entre el registro y el encolado. La cola utiliza una clave por actualización, evitando duplicados al reintentar. Se conservan los reintentos y la trazabilidad del proveedor.

## Protección del enlace

El acceso se valida por hash SHA-256. Para reutilizar el enlace en mensajes posteriores se conserva también el token cifrado con AES-256-GCM, utilizando el servicio de cifrado configurado. Las consultas autenticadas no devuelven el token cifrado ni el token reutilizable. La generación explícita muestra su URL una sola vez.

Los enlaces anteriores que solo conservaban hash pueden actualizarse al necesitar su URL: se conserva el hash anterior como alias del mismo acceso para no romper el enlace del cliente. La renovación o revocación explícita invalida ambos accesos. Un enlace revocado o expirado no se reactiva automáticamente.

## Solicitudes de modificación o cambio

El cliente registra la solicitud desde el seguimiento, tanto para revisión previa como por disconformidad después de recibir el pedido. Puede ver su estado y la respuesta comercial. Repetir el mismo envío pendiente devuelve la misma solicitud.

La bandeja Solicitudes de cambio permite consultar y registrar la resolución. Se usan `tracking.links.read` para consulta y `tracking.links.manage` para resolución. Resolver documenta la atención; no cambia automáticamente el pedido, las existencias, una venta o un cobro. Una reposición o devolución debe realizarse mediante la operación comercial/operativa correspondiente.

API:

- `POST /api/public/tracking/:token/change-requests`: `{ message }`.
- `GET /api/order-change-requests`: bandeja de atención, hasta las 200 solicitudes más recientes priorizando pendientes.
- `POST /api/order-change-requests/:id/resolve`: `{ response }`.
- `GET /api/notification-event-settings` y `POST /api/notification-event-settings`: preferencias por evento.

## Migraciones y operación

- `1720000049000-add-notification-event-settings.ts`: preferencias persistentes y usuario que las modifica.
- `1720000050000-unify-order-workflow.ts`: eventos, vistas de cobertura y etapa, historial independiente del enlace, acceso cifrado y solicitudes de cambio.

La variable `NOTIFICATION_WORKER_ENABLED=false` desactiva el trabajador para pruebas aisladas; no equivale a deshabilitar las preferencias ni elimina el encolado. El valor habitual es true.

El bloqueo global asume un único almacén. Antes de escalar a varios almacenes se debe segmentar el bloqueo y la asignación por almacén. La preparación completa sustituye la regla anterior que permitía confirmar una preparación reducida por falta de stock; las entregas parciales al cliente continúan registrándose como resultado de visita.

## Verificación

La prueba `backend/scripts/order-workflow.acceptance.mjs` exige `DATABASE_NAME=icar_workflow_validation`; no debe ejecutarse sobre la base operativa. Genera escenarios identificables en una copia aislada que se elimina al finalizar la validación del entorno. El trabajador de WhatsApp permanece desactivado y se comprueba que no hay intentos reales de envío para sus pedidos.

La matriz y los resultados definitivos se mantienen en [Pruebas del flujo unificado](./pruebas-aceptacion-flujo-unificado-pedidos.md).

## Colores de estado en Pedidos

La columna Estado y el detalle del pedido usan el estado operativo para elegir el color. Antes se utilizaba el estado comercial CONFIRMADO y todas las etapas posteriores aparecían con el mismo color.

| Estado | Color |
| --- | --- |
| Borrador | Gris |
| Recibido | Azul |
| Aprobado | Índigo |
| En preparación | Ámbar |
| Disponible para preparar | Cian |
| Preparado | Verde azulado |
| Asignado | Violeta |
| En reparto | Naranja |
| Entregado | Verde |
| Entrega parcial | Rosa |
| No entregado | Marrón |
| Cancelado | Rojo |

Cada etiqueta conserva el nombre del estado y combina fondo claro, texto oscuro y borde del mismo tono. La paleta compartida está definida en `frontend/src/app/core/order-workflow.ts`.

Verificación del ajuste visual: compilador Angular y compilación de producción Docker aprobados. Se comprobaron 12 combinaciones distintas, con contraste mínimo de texto/fondo de 4,52:1.
