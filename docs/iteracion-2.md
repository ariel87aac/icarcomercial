# Segunda iteración: catálogo, almacén y pedidos

## Alcance

La segunda iteración implementa el catálogo de productos y presentaciones, las condiciones de precio, el inventario base, la creación de pedidos y el flujo `BORRADOR → RECIBIDO → CONFIRMADO`. Un pedido recibido también puede volver a `BORRADOR` con una observación. Como ajuste posterior a la prueba de aceptación se incorporó la transición a `CANCELADO` desde cualquiera de esos tres estados.

La confirmación reserva la existencia disponible, conserva la cantidad pendiente cuando la reserva es parcial y no descuenta el inventario físico. El cliente solo puede operar sobre sus propios pedidos; el personal interno accede según sus permisos.

## Historias cubiertas

| Historia | Evidencia funcional |
| --- | --- |
| HU-08 | Catálogo comercial de categorías, líneas, unidades, productos y presentaciones. |
| HU-09 | Precios vigentes diferenciados por los tipos Público, Minorista, Distribuidor y Mayorista. |
| HU-10 | Administración y activación o desactivación de los elementos del catálogo. |
| HU-11 | Registro de pedidos propios desde el portal del cliente. |
| HU-12 | Registro de pedidos por el personal de comercialización. |
| HU-13 | Envío, revisión, corrección y devolución del pedido a borrador. |
| HU-14 | Confirmación inmutable del pedido y captura de sus datos comerciales. |
| HU-15 | Existencias, movimientos, reservas completas o parciales y cantidades pendientes. |
| HU-16 | Consulta cronológica del historial de estados y responsables. |
| PA-02-01 | Ajuste de aceptación: cancelación lógica con motivo, responsable, auditoría y liberación de reservas activas. |
| PA-02-02 | Ajuste de aceptación: cliente obligatorio para el carrito interno, calendario de reparto por zona y ventanas configurables de cierre y preparación. |
| PA-02-03 | Ajuste de aceptación: el módulo administrativo se identifica como **Productos** y conserva sus opciones de configuración. |
| PA-02-04 | Ajuste de aceptación: el módulo **Almacén** presenta en una tabla únicamente productos con existencia física, incluyendo imagen, categoría y línea. |
| PA-02-05 | Ajuste de integración con Distribución: cada presentación conserva su peso en kg para calcular la carga del vehículo. |

## Matriz de permisos

| Rol | Productos | Almacén | Pedidos |
| --- | --- | --- | --- |
| `ADMINISTRADOR` | Consulta y administra | Consulta y registra movimientos | Consulta, registra, modifica, confirma, cancela, configura cierres y consulta historial |
| `COMERCIALIZACION` | Consulta y administra | Consulta | Consulta, registra, modifica, confirma, cancela, configura cierres y consulta historial |
| `ALMACEN` | Consulta | Consulta y registra movimientos | Consulta historial |
| `CLIENTE` | Consulta el catálogo y su precio aplicable | Sin acceso | Registra, modifica, cancela y consulta solamente pedidos propios; consulta su historial |

Los permisos incorporados son `catalog.read`, `catalog.manage`, `pricing.manage`, `inventory.read`, `inventory.movements.create`, `orders.read`, `orders.create`, `orders.update`, `orders.confirm`, `orders.cancel`, `orders.delete`, `orders.scheduling.manage` y `orders.history.read`. La interfaz adapta las funciones visibles, pero la API vuelve a comprobar cada permiso y el alcance del cliente. `orders.delete` se asigna al rol Administrador y permite retirar lógicamente pedidos que ya estén cancelados, sin borrar su trazabilidad.

## Rutas de la API

Todas las rutas requieren una sesión válida. Se conservan alias en inglés para uso interno y se exponen las rutas en español descritas para la iteración.

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/catalogo` | Consulta productos y presentaciones activos con el precio aplicable. |
| `GET / POST / PATCH` | `/api/categorias` | Administra categorías de producto. |
| `GET / POST / PATCH` | `/api/lineas-productivas` | Administra líneas productivas. |
| `GET / POST / PATCH` | `/api/unidades` | Administra unidades de medida. |
| `GET / POST / PATCH` | `/api/productos` | Administra productos. |
| `PUT` | `/api/productos/:id/imagen` | Guarda o reemplaza la imagen JPG, PNG o WebP del producto. |
| `GET` | `/api/catalogo/productos/:id/imagen` | Entrega la imagen al usuario autenticado con permiso de catálogo. |
| `GET / POST / PATCH` | `/api/productos/:id/presentaciones` | Administra presentaciones de un producto. |
| `GET / POST` | `/api/presentaciones/:id/precios` | Consulta o registra condiciones de precio. |
| `GET / PATCH` | `/api/precios` | Consulta o modifica precios y vigencias. |
| `GET` | `/api/precios/matriz` | Consulta por producto y presentación los cuatro precios vigentes. |
| `PUT` | `/api/precios/actualizacion-masiva` | Guarda en una transacción los precios confirmados desde la tabla. |
| `GET` | `/api/inventario/existencias` | Consulta cantidad física, reservada y disponible. |
| `GET / POST` | `/api/inventario/movimientos` | Consulta o registra ingresos y ajustes. |
| `GET` | `/api/inventario/reservas` | Consulta las reservas de pedidos confirmados. |
| `GET` | `/api/order-scheduling/settings` | Consulta la configuración vigente de cierre y preparación. |
| `PATCH` | `/api/order-scheduling/settings` | Modifica horarios y días de anticipación; requiere `orders.scheduling.manage`. |
| `GET` | `/api/order-scheduling/delivery-options` | Obtiene próximas fechas abiertas según los días activos de la zona del domicilio. |
| `GET / POST / PATCH` | `/api/pedidos` | Consulta, registra o modifica pedidos autorizados. |
| `POST` | `/api/pedidos/:id/enviar` | Cambia un borrador a recibido. |
| `POST` | `/api/pedidos/:id/devolver` | Devuelve un pedido recibido a borrador con observación. |
| `POST` | `/api/pedidos/:id/confirmar` | Confirma el pedido y crea sus reservas. |
| `POST` | `/api/pedidos/:id/cancelar` | Cancela con motivo obligatorio y libera reservas activas cuando estaba confirmado. |
| `GET` | `/api/pedidos/:id/historial` | Consulta la secuencia de estados del pedido. |

## Persistencia y reglas

La migración original `1720000003000-create-iteration-two.ts` creó el catálogo y su esquema inicial de precios:

- `categorias_producto`, `lineas_productivas`, `unidades_medida`, `productos`, `presentaciones_producto` y `precios_producto`.
- `pedidos`, `pedidos_detalle` y `pedidos_estados_historial`.
- `existencias`, `movimientos_inventario` y `reservas_inventario`.

La migración correctiva `1720000018000-unify-customer-types-and-prices.ts` elimina `lista_comercial` de clientes y precios, incorpora `PUBLICO` al enum y deja `tipo_cliente` obligatorio en cada precio. Los precios históricos de listas cuyos nombres coinciden con los cuatro tipos se convierten a su tipo correspondiente; la migración se detiene con un mensaje explícito si encontrara una lista de precio que no pueda convertirse, para no perder información silenciosamente.

Se rechazan vigencias superpuestas para una misma presentación y tipo de cliente. La fecha de entrega debe coincidir con cualquiera de los días de distribución activos de la zona del domicilio. No se usa una anticipación fija por tipo de cliente: la disponibilidad se decide con el cierre configurable y sólo se ofrecen fechas cuyo cierre todavía no venció.

## Ajuste de aceptación: tabla unificada de precios

La opción **Productos → Precios** presenta una fila por presentación, ordenada por código de producto, nombre y presentación. Sus columnas son **Cod-Producto**, **Producto/Presentación**, **Público**, **Minorista**, **Distribuidor**, **Mayorista** y **Última Modificación**.

Los cuatro importes se editan directamente en la tabla. La edición sólo modifica un borrador local: no se envía una petición por cada celda. El botón superior **Actualizar** se habilita cuando existe al menos un cambio y abre un modal que informa cuántos precios se actualizarán. **Cancelar** conserva la base sin cambios; **Aceptar** envía el conjunto a `/api/precios/actualizacion-masiva`, que bloquea los registros involucrados y los guarda dentro de una única transacción. La acción queda registrada como `ACTUALIZAR_PRECIOS_MASIVO` en auditoría.

Como ajuste de integración con la cuarta iteración, `1720000017000-add-route-weight-capacity.ts` agrega `peso_kg` a `presentaciones_producto`. El alta de una presentación exige este dato positivo y la edición permite corregirlo. Para los productos históricos cuya unidad base es kilogramo se inicializa con el factor de conversión; las demás presentaciones deben configurarse explícitamente para evitar asumir pesos no documentados.

Los movimientos son inmutables y no pueden dejar una existencia física negativa ni inferior a su cantidad reservada. El disponible se calcula como `cantidad física - cantidad reservada`.

## Catálogo visual y carrito

La migración `1720000006000-add-product-images.ts` incorpora la imagen y su tipo MIME al producto. El archivo se conserva en PostgreSQL y se restringe a JPG, PNG o WebP de hasta 2 MB. La respuesta del catálogo expone únicamente la ruta autenticada de la imagen; no incluye el contenido binario ni permite direcciones externas.

El carrito se conserva en el navegador y se separa por usuario y cliente seleccionado. Un usuario interno debe elegir explícitamente al cliente antes de consultar precios, abrir productos o usar el carrito; no se selecciona automáticamente el primer cliente. Una cuenta de tipo `CLIENTE` usa siempre su cliente vinculado. Cuando el carrito contiene productos, el cliente queda bloqueado: un intento de cambiarlo o limpiar la selección mantiene el cliente original y muestra una alerta. El cambio se habilita después de crear el pedido o retirar todos los productos.

Permite elegir la presentación, modificar cantidades, retirar productos, seleccionar el domicilio y una fecha de entrega habilitada y crear un pedido en estado `BORRADOR`. El resumen diferencia fecha de pedido, cierre para cambios, límite de preparación o consolidado y fecha de entrega. Los importes del carrito son referenciales: al guardar, enviar y confirmar, la API vuelve a validar permisos, cliente, productos, vigencias y precios.

## Programación de pedidos por zona

La migración `1720000012000-add-order-scheduling.ts` crea `configuracion_programacion_pedidos` y agrega a `pedidos` las columnas `fecha_cierre_pedido` y `fecha_preparacion`. La configuración inicial es:

- cierre de pedidos: 1 día antes de la entrega a las 13:00;
- límite de preparación o emisión del consolidado: 1 día antes de la entrega a las 18:00;
- ambos días de anticipación y horarios son configurables por `ADMINISTRADOR` y `COMERCIALIZACION`.

Cada pedido guarda una copia de sus fechas calculadas. Por ello, cambiar la configuración no modifica retroactivamente los pedidos ya creados. Las zonas pueden tener uno, dos o los siete días de la semana activos; las opciones del catálogo se generan con todos ellos. Antes del cierre, un pedido `BORRADOR` o `RECIBIDO` puede editarse, enviarse, devolverse o cancelarse. Al vencer `fecha_cierre_pedido`, la edición y el envío para la fecha cerrada se rechazan; la interfaz muestra una decisión para conservar el detalle en la siguiente fecha abierta de la zona o cancelar el pedido.

La migración `1720000013000-add-consolidation-deadline.ts` lleva el mismo hito a `consolidaciones_produccion.fecha_limite_preparacion`. Al generar o recalcular una consolidación se conserva el límite más temprano de sus pedidos de origen; Producción puede ver la fecha y la marca **Plazo vencido** mientras el consolidado continúe en Borrador.

## Confirmación transaccional

La confirmación ejecuta en una sola transacción:

1. Bloquea el pedido y comprueba que continúe en estado `RECIBIDO`.
2. Vuelve a validar cliente, domicilio, zona, día, anticipación, productos activos y precios vigentes.
3. Bloquea las existencias por presentación en un orden estable para serializar las reservas concurrentes.
4. Compromete en `existencias.cantidad_reservada` toda la cantidad solicitada, incluso cuando supera el saldo físico. En el detalle conserva por separado la cantidad cubierta por Almacén y la cantidad que deberá producirse.
5. Conserva instantáneas de cliente, domicilio, zona, producto, presentación, unidad y precio.
6. Registra el estado `CONFIRMADO` y el evento de auditoría en la misma transacción.

Ante cualquier error se revierten el estado, las reservas, los saldos, el historial y la auditoría de esa confirmación.

### Integración con la tercera iteración

La reserva global creada en la confirmación compromete la cantidad completa del pedido y puede superar la existencia física. Por cada detalle, `cantidad_reservada` conserva la porción cubierta físicamente y `cantidad_pendiente` la porción que debe producirse; la tercera iteración usa esas dos cantidades para evitar duplicar el requerimiento. La fuente conserva además el factor y la equivalencia en unidad base para trazabilidad.

### Ajuste posterior: recepción de Producción en Almacén

La migración `1720000015000-production-plant-and-reception.ts` agrega el tipo de movimiento `INGRESO_PRODUCCION`, amplía existencias y movimientos a seis decimales y relaciona cada movimiento con una entrega de Producción única.

El ingreso aplica estas reglas:

1. Producción entrega el producto en la misma presentación de la orden.
2. Registrar la entrega no cambia la existencia.
3. Almacén acepta la cantidad recibida; si difiere de la entregada, debe escribir una observación.
4. La aceptación aumenta la existencia física y crea un movimiento inmutable `INGRESO_PRODUCCION` en una sola transacción.
5. La referencia única impide contabilizar dos veces la misma entrega.

Las reservas de pedidos ya existentes no se alteran al recibir Producción. Por tanto, el nuevo ingreso aumenta el saldo disponible para preparación y para reservas posteriores sin perder el vínculo con el producto terminado que lo originó.

## Ajuste originado en prueba de aceptación

La prueba de aceptación de la segunda iteración no fue superada porque el flujo no permitía cancelar un pedido. La corrección se agrega mediante la migración `1720000011000-add-order-cancellation.ts` y aplica estas reglas:

1. Los pedidos `BORRADOR` y `RECIBIDO` pasan a `CANCELADO` sin eliminación física.
2. Un pedido `CONFIRMADO` puede cancelarse si sus reservas continúan activas y todavía no tiene preparación, entrega o venta asociada.
3. La cancelación de un confirmado bloquea el pedido y cada existencia, resta la cantidad de `cantidad_reservada`, conserva `cantidad_fisica` sin cambios y marca la reserva como `LIBERADA`.
4. Si la reserva fue consumida o existe un proceso operativo posterior, la operación se rechaza para evitar alterar mercadería ya preparada o despachada.
5. El motivo es obligatorio; se guardan el usuario y la fecha de cancelación, el historial `estado anterior → CANCELADO` y el evento `CANCELAR_PEDIDO` en auditoría.
6. Los enlaces públicos de seguimiento activos se revocan al cancelar.
7. Un pedido cancelado es inmutable y no puede volver a enviarse, confirmarse o cancelarse.

No se elimina ningún pedido ni su detalle, de modo que la trazabilidad se conserva.

## Ajuste de aceptación por cierre vencido

Cuando un pedido `BORRADOR` o `RECIBIDO` alcanza su cierre, la pantalla **Pedidos** muestra una ventana emergente con dos alternativas:

1. **Preparar para la siguiente fecha:** `POST /api/pedidos/:id/reprogramar-siguiente-fecha` busca el primer día de reparto posterior que todavía tenga el cierre abierto, conserva las cantidades, vuelve a validar productos y precios, y actualiza entrega, cierre, preparación y total en una transacción.
2. **Cancelar pedido:** solicita el motivo y conserva el registro en estado `CANCELADO`. El vencimiento del cierre no impide cancelar; en pedidos confirmados continúan aplicándose las restricciones por preparación, entrega, venta o reserva consumida.

La reprogramación limitada conserva el estado `BORRADOR` o `RECIBIDO`, agrega un evento del mismo estado al historial con las fechas anterior y nueva, y registra `REPROGRAMAR_PEDIDO_SIGUIENTE_FECHA` en auditoría. No se permite reprogramar un pedido `CONFIRMADO`.

Si el cierre vence mientras el usuario mantiene abierto el carrito, el intento de creación recibe HTTP 422 y abre la misma decisión. La opción de siguiente fecha vuelve a consultar el calendario y conserva el carrito; cancelar vacía el carrito.

## Pruebas de aceptación

La modificación **Solicitudes de abastecimiento** agrega en Almacén una interfaz para que Comercial solicite cantidades adicionales para stock sin alterar existencias ni reservas. La evidencia detallada se encuentra en `docs/pruebas-aceptacion-solicitudes-abastecimiento.md`.

Como ajuste de aceptación, Almacén permite crear varias solicitudes para una misma fecha requerida. Cada solicitud mantiene código, detalle, estado y orden de Producción independientes; la fecha deja de ser una restricción única.

### Ajuste: confirmación segura y mensajería del pedido

La migración `1720000028000-add-order-confirmation-flow.ts` sustituye el código compuesto por un correlativo numérico corto, migra los códigos anteriores y agrega una restricción para impedir valores no numéricos. La cabecera de Pedidos incorpora cuatro botones-totalizadores para Borrador, Recibido, Confirmado y Cancelado; cada botón aplica o retira su filtro de estado. Se mantienen el totalizador del resultado, la búsqueda y la representación `Pedido → Producción → Preparación → Distribución`.

La tabla de Pedidos separa las operaciones colocando primero **Flujo del pedido** y al final **Gestión**. Gestión presenta siempre Revisar, Historial, Editar y Eliminar en una cuadrícula 2×2, deshabilitando lo que no corresponde al estado o permiso. Flujo del pedido contiene las transiciones dinámicas Enviar, Devolver, Confirmar, Cancelar y Resolver cierre, además del acceso al seguimiento cuando el pedido está confirmado. La migración `1720000030000-add-order-soft-delete.ts` incorpora la eliminación lógica de pedidos cancelados y el permiso `orders.delete`.

Al registrar el pedido se crea un enlace de confirmación cuyo token sólo se entrega por WhatsApp; la base de datos conserva únicamente el hash. El cliente puede confirmar un `BORRADOR` o `RECIBIDO` antes del cierre sin iniciar sesión. La confirmación pública reutiliza la validación transaccional de la confirmación interna, identifica el origen `PORTAL`, permite un historial sin usuario interno y consume el enlace. Confirmar internamente o cancelar revoca cualquier enlace activo.

La cola de la quinta iteración incorpora `PEDIDO_BORRADOR`, `PEDIDO_CONFIRMADO` y `PEDIDO_CANCELADO`. Las plantillas admiten enlace, productos, total, entrega y motivo; la idempotencia evita duplicar un mensaje del mismo evento. El detalle completo y el guion controlado están en `docs/pruebas-aceptacion-pedidos-confirmacion-whatsapp.md`.

El script `backend/scripts/iteration-two.acceptance.mjs` ejecuta las comprobaciones funcionales de la segunda iteración, los ajustes posteriores y la comprobación IMG-01. Cubre catálogo activo, persistencia y lectura autenticada de imágenes, los cuatro tipos de cliente, matriz y actualización masiva de precios, superposición de vigencias, aislamiento entre clientes, reglas de fecha y zona, transiciones, inmutabilidad, reserva completa y parcial, concurrencia, reversión transaccional, movimientos, disponibilidad, historial, cancelación, programación de pedidos y la tabla de existencias de Almacén.

Los casos agregados son:

- `CP-33`: cancelar un borrador conserva el pedido, registra el motivo y evita una segunda cancelación.
- `CP-34`: cancelar un recibido propio desde la cuenta del cliente.
- `CP-35`: cancelar un confirmado libera la reserva, aumenta el disponible y no cambia la existencia física.
- `CP-36`: sólo el personal autorizado puede configurar cierre y límite de consolidación.
- `CP-37`: el calendario usa todos los días activos de la zona, obliga al personal a indicar cliente y respeta el alcance del cliente autenticado.
- `CP-38`: el pedido conserva por separado registro, cierre, preparación y entrega.
- `CP-39`: el cliente puede modificar cantidades de un pedido `RECIBIDO` antes del cierre.
- `CP-40`: después del cierre se rechaza la edición de la fecha vencida, se reprograma a la siguiente fecha abierta con historial y auditoría, y también puede cancelarse.
- `CP-43` (interfaz): el cierre vencido abre una ventana con las alternativas de preparar para la siguiente fecha o cancelar.
- `CP-120` (interfaz): el menú y el encabezado muestran **Productos**; al ingresar se conservan las opciones Productos, Categorías, Líneas, Unidades y Precios con el permiso `catalog.manage`.
- `CP-121`: **Almacén** muestra únicamente existencias físicas mayores que cero, con imagen, categoría y línea; la tabla se ordena por categoría, línea, producto y presentación.
- `PRICE-MATRIX-01`: la matriz expone los cuatro tipos en el orden definido y la actualización masiva persiste en conjunto los importes confirmados.
- `CP-P04` (integración): la entrega registrada por Producción no cambia la existencia antes de ser aceptada.
- `CP-P05` (integración): Almacén recibe la misma presentación, registra `INGRESO_PRODUCCION` y no permite una recepción duplicada.

Con el stack en ejecución:

```bash
docker compose exec -T backend npm run test:acceptance:iteration2
```

La regresión de la primera iteración se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance
```

## Fuera de alcance

Esta iteración no implementa reprogramación manual a una fecha arbitraria. La única reprogramación admitida es la corrección automática por cierre vencido hacia la siguiente fecha abierta de la zona. La consolidación para producción, preparación, despacho, rutas, entrega, notificaciones, ventas, pagos y saldos por cobrar corresponden a iteraciones posteriores.
