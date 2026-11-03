# Pruebas de aceptación: continuidad del carrito borrador

## Cambio solicitado

Un pedido en estado `BORRADOR` permanece asociado al carrito del cliente hasta que sea enviado. El mismo comportamiento se aplica cuando un usuario interno selecciona al cliente desde el catálogo.

## Reglas implementadas

1. El servidor consulta el borrador más recientemente actualizado dentro del alcance del cliente autenticado.
2. Para un usuario interno, la consulta utiliza el cliente seleccionado en el catálogo.
3. Al abrir el catálogo se reconstruyen productos, cantidades, precios, domicilio, fecha de entrega y observaciones.
4. El carrito conserva el código del pedido y muestra que se está continuando un borrador.
5. Cerrar con la `X` o seleccionar **Seguir comprando** guarda el mismo pedido de forma silenciosa mediante `PATCH`; no genera un código nuevo.
6. Si se intenta crear otro pedido mientras existe un borrador, el backend reutiliza el borrador activo para evitar duplicados.
7. Cuando el pedido deja de estar en `BORRADOR`, la siguiente consulta elimina del navegador la copia vinculada a ese borrador.
8. Un usuario interno puede cambiar de cliente; cada selección recupera y abre el borrador correspondiente sin mezclar carritos.
9. El modal ofrece únicamente **Seguir comprando** y **Enviar pedido**. Enviar guarda primero el borrador y luego cambia el pedido a `RECIBIDO`.
10. Crear o modificar el borrador no genera WhatsApp. El mensaje, el detalle y el enlace de aprobación se generan al enviar.
11. Los perfiles internos contables y comerciales con lectura de clientes y pedidos reciben acceso de lectura al Catálogo; modificar o enviar continúa sujeto a los permisos específicos de Pedidos.
12. En el resumen del pedido, Domicilio de entrega se muestra sobre Fecha de entrega en todos los anchos; ambos selectores ocupan el ancho disponible.

## Casos de aceptación

| Código | Escenario | Resultado esperado |
| --- | --- | --- |
| CB-01 | Cliente crea un pedido borrador | El código queda visible en el carrito y los productos no desaparecen |
| CB-02 | Cliente sale y vuelve al catálogo | Se recupera el mismo código, domicilio, fecha, observaciones y detalle |
| CB-03 | Cliente agrega otro producto | El producto se suma al carrito recuperado |
| CB-04 | Cliente cierra el modal con la X o presiona Seguir comprando | Se actualiza el mismo pedido silenciosamente; no se genera otro código ni mensaje |
| CB-05 | Usuario interno selecciona un cliente con borrador | El catálogo carga automáticamente el borrador de ese cliente |
| CB-06 | Usuario interno cambia entre clientes con borradores | Cada selección abre el carrito del cliente elegido y conserva separados los borradores |
| CB-07 | Petición de creación repetida para un cliente con borrador | El backend actualiza el borrador existente |
| CB-08 | El pedido ya fue enviado | El catálogo deja de tratarlo como carrito borrador |
| CB-09 | Otro cliente consulta el borrador | El alcance de autenticación impide acceder a un pedido ajeno |
| CB-10 | Cliente o usuario autorizado presiona Enviar pedido | El borrador se guarda, pasa a Recibido y se encola el detalle con enlace de aprobación |
| CB-11 | Abrir el modal desde un dispositivo móvil | Domicilio, fecha y botones se acomodan en una columna sin desbordamiento horizontal |
| CB-12 | Ingresar con Contabilidad u otro perfil interno habilitado | Puede abrir Catálogo, seleccionar clientes y consultar su borrador; sólo puede modificar o enviar si posee los permisos de Pedidos |

## Evidencia técnica

- Consulta autenticada: `GET /api/pedidos/borrador-carrito`.
- Creación inicial: `POST /api/pedidos`.
- Actualización posterior: `PATCH /api/pedidos/:id`.
- La migración `GrantCatalogDraftView1720000051000` habilita lectura del Catálogo a los perfiles internos comerciales y contables que ya consultaban clientes y pedidos.

## Evidencia ejecutada el 30 de octubre de 2026

| Control | Resultado |
| --- | --- |
| Compilación backend | Aprobada |
| Pruebas automatizadas backend | Aprobadas: 10 archivos y 28 pruebas |
| Compilación Angular estricta en Docker | Aprobada |
| Consulta autenticada del borrador para cliente seleccionado | HTTP 200 |
| Reconstrucción de un borrador existente | Aprobada: recuperó el mismo código, productos, domicilio y fecha de entrega |
| Salud de PostgreSQL, backend y frontend | Aprobada; los tres contenedores quedaron saludables |
| Salud HTTP directa y mediante Nginx | Aprobada; `/api/health` informó base de datos disponible |
| Migración de acceso interno | Aprobada; `GrantCatalogDraftView1720000051000` fue registrada y habilitó `catalog.read` en los cinco perfiles previstos |
| Cambio entre clientes con perfil Administrador | Aprobado: cliente sin borrador mostró carrito vacío y cliente con borrador abrió automáticamente el pedido existente |
| Guardado automático mediante Seguir comprando | Aprobado: permaneció en `BORRADOR` y no aumentó el total de notificaciones |
| Diseño móvil del modal | Aprobado a 390 × 844 px; campos y botones quedaron en una columna sin desbordamiento |
| Límite de 300 líneas | Aprobado: 347 archivos activos verificados |
