# Pruebas de aceptación: programación de pedidos desde catálogo

## Objetivo

Verificar que el catálogo asigne el pedido al cliente correcto, calcule las fechas operativas con el calendario de su zona y limite los cambios según un cierre configurable.

## Configuración de referencia

| Parámetro | Valor de prueba |
| --- | --- |
| Días de anticipación del cierre | 1 día antes de la entrega |
| Hora de cierre | 13:00, zona horaria `America/La_Paz` |
| Días de anticipación para preparación | 1 día antes de la entrega |
| Hora límite del consolidado | 18:00, zona horaria `America/La_Paz` |

Ejemplo verificable: para una entrega el jueves, el cierre se calcula el miércoles a las 13:00 y la preparación o consolidación hasta el miércoles a las 18:00.

## Casos automatizados

| Caso | Condición | Acción | Resultado esperado | Resultado |
| --- | --- | --- | --- | --- |
| CP-36 | Usuario `COMERCIALIZACION` y usuario `CLIENTE` | Modificar la configuración | Comercialización obtiene HTTP 200; cliente obtiene HTTP 403 | Aprobado |
| CP-37 | Zona con dos días activos y domicilios de distintos clientes | Consultar fechas disponibles | Aparecen ambos días; el personal sin cliente obtiene HTTP 400; un cliente no consulta domicilios ajenos | Aprobado |
| CP-38 | Fecha de entrega abierta | Crear pedido desde el catálogo | Se guardan `createdAt`, `orderCutoffAt`, `preparationAt` y `requestedDate` con valores separados | Aprobado |
| CP-39 | Pedido propio en estado `RECIBIDO` antes del cierre | Cambiar cantidad | La modificación obtiene HTTP 200, conserva `RECIBIDO` y actualiza el detalle | Aprobado |
| CP-40 | Pedido `BORRADOR` cuyo cierre ya venció | Editar, reprogramar y volver a cancelar después de otro cierre simulado | La edición obtiene HTTP 422; la reprogramación conserva el estado y detalle, asigna una fecha posterior abierta y registra historial/auditoría; la cancelación posterior obtiene HTTP 201 | Aprobado |

## Caso de interfaz

| Caso | Condición | Acción | Resultado esperado |
| --- | --- | --- | --- |
| CP-41 | Usuario interno, cliente A seleccionado y carrito con productos | Seleccionar cliente B o limpiar el cliente | Se conserva el cliente A y aparece la alerta “Pedido en proceso”; después de crear el pedido o vaciar el carrito puede seleccionarse otro cliente |
| CP-42 | Catálogo o formulario de creación/edición con un producto seleccionado | Presionar `−`, presionar `+` y luego escribir una cantidad manual | La cantidad disminuye o aumenta en una unidad, permite hasta tres decimales escritos manualmente y recalcula el subtotal sin perder el producto |
| CP-43 | El cierre vence con un carrito o un pedido `BORRADOR`/`RECIBIDO` pendiente | Intentar crear el pedido o abrir **Pedidos** | Aparece **Cierre de pedido finalizado** con las opciones **Preparar para siguiente fecha** y **Cancelar pedido**; la primera conserva los productos y la segunda solicita motivo en un pedido guardado o vacía el carrito todavía no guardado |

Ejecución realizada:

```bash
docker compose exec -T backend npm run test:acceptance:iteration2
```

Resultado: **32 comprobaciones aprobadas**, incluida la regresión de catálogo, precios, almacén, inventario transaccional, confirmación y cancelación.

## Guion de aceptación visual

1. Ingresar como `ADMINISTRADOR` o `COMERCIALIZACION` y abrir **Catálogo**.
2. Comprobar que el carrito está deshabilitado y que no se muestran precios hasta seleccionar **Cliente del pedido**.
3. Seleccionar un cliente; comprobar que aparecen sus precios y que el carrito queda separado para ese cliente.
4. Agregar un producto e intentar seleccionar otro cliente. Debe conservarse el cliente original y mostrarse la alerta **Pedido en proceso**.
5. Retirar todos los productos y comprobar que ahora sí sea posible seleccionar otro cliente; volver a preparar el carrito de prueba.
6. Abrir el carrito y elegir un domicilio.
7. Comprobar que **Fecha de entrega** sólo contiene días activos de la zona del domicilio.
8. Seleccionar una fecha y comprobar el resumen: fecha del pedido, cierre para cambios, preparación o consolidado y entrega.
9. Crear el borrador y abrirlo en **Pedidos**; comprobar los mismos cuatro hitos en la lista y en la revisión.
10. Enviar el pedido a `RECIBIDO` y modificar su cantidad antes del cierre; la operación debe completarse.
11. Confirmar pedidos, generar su consolidación y comprobar en **Producción** el campo **Preparar hasta**; si permanece en Borrador después del límite debe mostrar **Plazo vencido**.
12. Para validar un cierre vencido se usa CP-40 automatizado, que modifica únicamente el pedido temporal de prueba y confirma que la edición se rechace, la reprogramación elija una fecha posterior abierta y la cancelación continúe disponible.
13. En **Pedidos**, localizar un `BORRADOR` o `RECIBIDO` con cierre vencido. Debe abrirse la ventana **Cierre de pedido finalizado**; elegir **Preparar para siguiente fecha** y comprobar que cambien entrega, cierre y preparación sin perder el detalle.
14. Repetir con otro pedido vencido y elegir **Cancelar pedido**; registrar un motivo y comprobar el estado `CANCELADO`.
15. Conservar abierto un carrito hasta que venza su fecha seleccionada e intentar crearlo. Debe aparecer la misma ventana; **Preparar para siguiente fecha** conserva el carrito y selecciona la primera fecha abierta, mientras **Cancelar pedido** lo vacía.

## Criterio de aprobación

La modificación se acepta cuando CP-36 a CP-40 están aprobados, CP-41 a CP-43 superan la revisión visual, la compilación de backend y frontend finaliza sin errores y los servicios Docker permanecen saludables.
