# Segunda iteración: catálogo, inventario y pedidos

## Alcance

La segunda iteración implementa el catálogo de productos y presentaciones, las condiciones de precio, el inventario base, la creación de pedidos y el flujo `BORRADOR → RECIBIDO → CONFIRMADO`. Un pedido recibido también puede volver a `BORRADOR` con una observación.

La confirmación reserva la existencia disponible, conserva la cantidad pendiente cuando la reserva es parcial y no descuenta el inventario físico. El cliente solo puede operar sobre sus propios pedidos; el personal interno accede según sus permisos.

## Historias cubiertas

| Historia | Evidencia funcional |
| --- | --- |
| HU-08 | Catálogo comercial de categorías, líneas, unidades, productos y presentaciones. |
| HU-09 | Precios vigentes diferenciados por tipo de cliente o lista comercial. |
| HU-10 | Administración y activación o desactivación de los elementos del catálogo. |
| HU-11 | Registro de pedidos propios desde el portal del cliente. |
| HU-12 | Registro de pedidos por el personal de comercialización. |
| HU-13 | Envío, revisión, corrección y devolución del pedido a borrador. |
| HU-14 | Confirmación inmutable del pedido y captura de sus datos comerciales. |
| HU-15 | Existencias, movimientos, reservas completas o parciales y cantidades pendientes. |
| HU-16 | Consulta cronológica del historial de estados y responsables. |

## Matriz de permisos

| Rol | Catálogo y precios | Inventario | Pedidos |
| --- | --- | --- | --- |
| `ADMINISTRADOR` | Consulta y administra | Consulta y registra movimientos | Consulta, registra, modifica, confirma y consulta historial |
| `COMERCIALIZACION` | Consulta y administra | Consulta | Consulta, registra, modifica, confirma y consulta historial |
| `ALMACEN` | Consulta | Consulta y registra movimientos | Consulta historial |
| `CLIENTE` | Consulta el catálogo y su precio aplicable | Sin acceso | Registra, modifica y consulta solamente pedidos propios; consulta su historial |

Los permisos incorporados son `catalog.read`, `catalog.manage`, `pricing.manage`, `inventory.read`, `inventory.movements.create`, `orders.read`, `orders.create`, `orders.update`, `orders.confirm` y `orders.history.read`. La interfaz adapta las funciones visibles, pero la API vuelve a comprobar cada permiso y el alcance del cliente.

## Rutas de la API

Todas las rutas requieren una sesión válida. Se conservan alias en inglés para uso interno y se exponen las rutas en español descritas para la iteración.

| Método | Ruta | Función |
| --- | --- | --- |
| `GET` | `/api/catalogo` | Consulta productos y presentaciones activos con el precio aplicable. |
| `GET / POST / PATCH` | `/api/categorias` | Administra categorías de producto. |
| `GET / POST / PATCH` | `/api/lineas-productivas` | Administra líneas productivas. |
| `GET / POST / PATCH` | `/api/unidades` | Administra unidades de medida. |
| `GET / POST / PATCH` | `/api/productos` | Administra productos. |
| `GET / POST / PATCH` | `/api/productos/:id/presentaciones` | Administra presentaciones de un producto. |
| `GET / POST` | `/api/presentaciones/:id/precios` | Consulta o registra condiciones de precio. |
| `GET / PATCH` | `/api/precios` | Consulta o modifica precios y vigencias. |
| `GET` | `/api/inventario/existencias` | Consulta cantidad física, reservada y disponible. |
| `GET / POST` | `/api/inventario/movimientos` | Consulta o registra ingresos y ajustes. |
| `GET` | `/api/inventario/reservas` | Consulta las reservas de pedidos confirmados. |
| `GET / POST / PATCH` | `/api/pedidos` | Consulta, registra o modifica pedidos autorizados. |
| `POST` | `/api/pedidos/:id/enviar` | Cambia un borrador a recibido. |
| `POST` | `/api/pedidos/:id/devolver` | Devuelve un pedido recibido a borrador con observación. |
| `POST` | `/api/pedidos/:id/confirmar` | Confirma el pedido y crea sus reservas. |
| `GET` | `/api/pedidos/:id/historial` | Consulta la secuencia de estados del pedido. |

## Persistencia y reglas

La migración `1720000003000-create-iteration-two.ts` agrega la lista comercial opcional del cliente y crea:

- `categorias_producto`, `lineas_productivas`, `unidades_medida`, `productos`, `presentaciones_producto` y `precios_producto`.
- `pedidos`, `pedidos_detalle` y `pedidos_estados_historial`.
- `existencias`, `movimientos_inventario` y `reservas_inventario`.

Se rechazan condiciones de precio superpuestas para una misma presentación y condición comercial. Los clientes distribuidores y mayoristas requieren al menos 24 horas de anticipación, y la fecha solicitada debe coincidir con el día de distribución del domicilio activo.

Los movimientos son inmutables y no pueden dejar una existencia física negativa ni inferior a su cantidad reservada. El disponible se calcula como `cantidad física - cantidad reservada`.

## Confirmación transaccional

La confirmación ejecuta en una sola transacción:

1. Bloquea el pedido y comprueba que continúe en estado `RECIBIDO`.
2. Vuelve a validar cliente, domicilio, zona, día, anticipación, productos activos y precios vigentes.
3. Bloquea las existencias por presentación en un orden estable para evitar sobre-reservas concurrentes.
4. Reserva hasta el disponible y registra por separado la diferencia pendiente.
5. Conserva instantáneas de cliente, domicilio, zona, producto, presentación, unidad y precio.
6. Registra el estado `CONFIRMADO` y el evento de auditoría en la misma transacción.

Ante cualquier error se revierten el estado, las reservas, los saldos, el historial y la auditoría de esa confirmación.

## Pruebas de aceptación

El script `backend/scripts/iteration-two.acceptance.mjs` ejecuta CP-13 a CP-32. Cubre catálogo activo, precios diferenciados, superposición de vigencias, aislamiento entre clientes, reglas de fecha y zona, transiciones, inmutabilidad, reserva completa y parcial, concurrencia, reversión transaccional, movimientos, disponibilidad e historial.

Con el stack en ejecución:

```bash
docker compose exec -T backend npm run test:acceptance:iteration2
```

La regresión de la primera iteración se ejecuta con:

```bash
docker compose exec -T backend npm run test:acceptance
```

## Fuera de alcance

Esta iteración no implementa cancelación o reprogramación de pedidos, consolidación para producción, preparación, despacho, rutas, entrega, notificaciones, ventas, pagos ni saldos por cobrar. Esas capacidades corresponden a iteraciones posteriores.
