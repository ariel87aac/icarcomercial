# Pruebas de aceptación: pedidos, confirmación y WhatsApp

## Objetivo

Validar la primera ampliación del flujo de Pedidos: cabecera operativa, correlativo numérico, aviso de pedido en borrador, confirmación interna o mediante enlace seguro y aviso de cancelación.

## Alcance implementado

- La cabecera de **Pedidos** contiene cuatro botones-totalizadores para `BORRADOR`, `RECIBIDO`, `CONFIRMADO` y `CANCELADO`, además de los tres recuadros de total, búsqueda y flujo `Pedido → Producción → Preparación → Distribución`.
- Cada botón muestra el total real del estado dentro del alcance del usuario y funciona como filtro inmediato. Al presionar nuevamente el botón activo se restablecen todos los estados.
- La tabla presenta primero **Flujo del pedido** y deja **Gestión** como última columna. Gestión mantiene visibles Revisar, Historial, Editar y Eliminar en una matriz 2×2; las acciones no aplicables permanecen deshabilitadas. Flujo del pedido muestra únicamente las transiciones disponibles para el estado actual.
- **Eliminar** es una eliminación lógica reservada a administradores y sólo se habilita después de cancelar el pedido. El registro deja de participar en listados y contadores, pero conserva historial, auditoría, notificaciones y relaciones.
- `pedidos.codigo` conserva el tipo de texto por compatibilidad, pero tiene una restricción que sólo admite dígitos. El valor se obtiene de `pedidos_codigo_seq` sin prefijo, fecha ni relleno.
- Al crear el borrador se genera un token aleatorio. En la base de datos sólo se guarda su hash SHA-256, con vencimiento igual al cierre del pedido.
- El enlace público permite confirmar un pedido `BORRADOR` o `RECIBIDO` mientras el cierre siga abierto. La confirmación usa las mismas validaciones y la misma transacción de reservas que la confirmación interna.
- Al confirmar internamente se revoca el enlace público. Al confirmar desde el enlace se marca como usado. Al cancelar se revocan los enlaces todavía activos.
- Los eventos `PEDIDO_BORRADOR`, `PEDIDO_CONFIRMADO` y `PEDIDO_CANCELADO` se colocan en la cola de WhatsApp con clave idempotente. Un error de LimiteAPI no revierte la operación comercial.
- La confirmación y el mensaje de confirmado incluyen la lista de productos. La cancelación incluye el motivo.

## Casos de aceptación

| Caso | Condición | Acción | Resultado esperado | Estado técnico |
| --- | --- | --- | --- | --- |
| PED-WA-01 | Usuario con acceso a Pedidos | Abrir **Pedidos** | Se muestran los tres recuadros superiores y el flujo en el orden definido | Aprobado visualmente |
| PED-WA-02 | Existen pedidos anteriores | Aplicar la migración | Todos los códigos quedan sólo con números y la secuencia continúa desde el mayor | Aprobado: `1…15`, siguiente `16` |
| PED-WA-03 | Cliente, domicilio, fecha abierta y detalle válidos | Crear pedido | Se crea un código numérico, estado `BORRADOR`, enlace con hash y notificación `PEDIDO_BORRADOR` | Pendiente de aceptación operativa para no enviar un WhatsApp real durante la instalación |
| PED-WA-04 | Enlace activo antes del cierre | Abrir el enlace sin iniciar sesión | Se muestran cliente, entrega, total y productos; no se exponen domicilio, teléfono ni token almacenado | API pública verificada; guion visual pendiente con pedido de prueba autorizado |
| PED-WA-05 | Pedido en `BORRADOR` o `RECIBIDO` y enlace activo | Presionar **Confirmar mi pedido** | Se revalidan precios, calendario y existencias; se reservan saldos, se registra origen `PORTAL`, el enlace pasa a `USADO` y se encola `PEDIDO_CONFIRMADO` | Implementado; pendiente de aceptación operativa |
| PED-WA-06 | Pedido `RECIBIDO` | Confirmar como usuario interno | Se confirma y reserva, se registra al usuario, se revoca el enlace y se encola un único mensaje de confirmado | Implementado; pendiente de aceptación operativa |
| PED-WA-07 | Pedido confirmable después del cierre | Confirmar desde el enlace | Se rechaza la confirmación y el pedido no cambia de estado ni altera inventario | Implementado; pendiente de aceptación operativa |
| PED-WA-08 | Enlace ya usado, revocado o inválido | Intentar confirmar nuevamente | No se ejecutan reservas ni se duplica la notificación | API inválida aprobada con HTTP 404; repetición pendiente del guion operativo |
| PED-WA-09 | Pedido cancelable | Registrar motivo y cancelar | Se conserva el pedido en `CANCELADO`, se revoca el enlace y se encola `PEDIDO_CANCELADO` con el motivo | Implementado; pendiente de aceptación operativa |
| PED-WA-10 | El proveedor está caído o sin credencial | Crear, confirmar o cancelar | La operación comercial concluye; la notificación conserva su trazabilidad para reintento o diagnóstico | Implementado por cola desacoplada |
| PED-WA-11 | Dos solicitudes usan el mismo enlace simultáneamente | Confirmar ambas | El bloqueo pesimista permite una sola confirmación; la segunda no duplica reservas ni mensaje | Implementado; pendiente de prueba concurrente controlada |
| PED-WA-12 | Existen pedidos en distintos estados | Abrir **Pedidos** | Los cuatro botones muestran los totales de Borrador, Recibido, Confirmado y Cancelado | Aprobado técnica y visualmente |
| PED-WA-13 | No existe un filtro de estado activo | Presionar **Recibido** | La tabla muestra únicamente pedidos `RECIBIDO` y el botón queda resaltado | Aprobado técnica y visualmente |
| PED-WA-14 | El filtro `RECIBIDO` está activo | Presionar nuevamente **Recibido** | Se quita el filtro y la tabla vuelve a mostrar todos los estados | Aprobado técnica y visualmente |
| PED-WA-15 | Usuario de tipo cliente | Consultar los totalizadores | Los contadores incluyen únicamente los pedidos pertenecientes a ese cliente | Implementado en la API con el mismo alcance de seguridad del listado |
| PED-WA-16 | Abrir Pedidos en cualquier estado | Revisar las últimas columnas | Se muestra primero **Flujo del pedido** y **Gestión** queda como última columna | Aprobado técnica y visualmente |
| PED-WA-17 | Pedido en cualquier estado | Revisar la columna Gestión | Revisar, Historial, Editar y Eliminar permanecen visibles en disposición 2×2; Editar o Eliminar se deshabilitan cuando no corresponden | Aprobado técnica y visualmente |
| PED-WA-18 | Pedido Borrador, Recibido, Confirmado o Cancelado | Revisar Flujo del pedido | Se muestran sólo Enviar, Devolver, Confirmar, Cancelar, Resolver cierre o Seguimiento según estado, permiso y plazo | Aprobado técnica y visualmente |
| PED-WA-19 | Pedido no cancelado | Intentar eliminar | La interfaz exige cancelarlo primero y la API rechaza la eliminación directa | Implementado |
| PED-WA-20 | Pedido cancelado y usuario con `orders.delete` | Registrar motivo y eliminar | Desaparece del listado y de los contadores; el registro y su trazabilidad permanecen en la base como eliminación lógica | Implementado |
| PED-WA-21 | Pedido con una o varias transiciones disponibles | Revisar **Flujo del pedido** | Los botones comienzan en el borde derecho y se distribuyen hacia la izquierda | Aprobado visualmente |
| PED-WA-22 | Existen pedidos con códigos numéricos de distintas longitudes | Abrir **Pedidos** | La tabla ordena por el valor numérico de **Cód. pedido**, de mayor a menor | Aprobado técnicamente |
| PED-WA-23 | Existen más de 25 pedidos con los filtros actuales | Abrir **Pedidos** | Se muestran 25 registros por página y el paginador permite navegar sin cargar todo el listado | Implementado; pendiente de prueba visual con más de 25 registros |
| PED-WA-24 | El usuario requiere revisar más registros | Cambiar el tamaño de página | El paginador permite seleccionar 25, 50 o 100 registros y solicita esa cantidad a la API | Implementado |
| PED-WA-25 | Abrir el listado de Pedidos | Revisar columnas y contenido | Se muestra en orden: Cód. pedido, Nombre de cliente, Fecha de pedido, Fecha de entrega, Detalle, Total, Estado, Flujo del pedido y Gestión; la primera columna contiene únicamente el número | Implementado |
| PED-WA-26 | Abrir Pedidos en una pantalla reducida | Revisar fechas, botones y desplazamiento | Las fechas usan formato corto, las acciones tienen etiquetas abreviadas y tamaño compacto, y la tabla conserva acceso a todas las columnas mediante desplazamiento horizontal | Implementado |

## Evidencia técnica ejecutada

- Compilación backend: aprobada.
- Compilación frontend: aprobada.
- Pruebas unitarias: **13 de 13 aprobadas**.
- Migración `AddOrderConfirmationFlow1720000028000`: aplicada correctamente en PostgreSQL local.
- Esquema: `usuario_id` del historial acepta `NULL` para representar al cliente del enlace sin atribuirlo falsamente a un usuario interno.
- Seguridad pública: un token inválido responde HTTP 404 sin exigir sesión y sin exponer información.
- Contenedores `database`, `backend` y `frontend`: saludables después de reconstruir.

## Guion de aceptación operativa

1. Configurar en **Seguimiento y mensajería → Canal** un número de prueba autorizado.
2. Crear un pedido pequeño para ese cliente y anotar su código numérico.
3. Verificar en **Historial de notificaciones** el evento `PEDIDO_BORRADOR`, su destinatario enmascarado y el cuerpo con productos, total, entrega y enlace.
4. Abrir el enlace en una ventana privada y comprobar que no solicita inicio de sesión.
5. Confirmar el pedido y comprobar estado `CONFIRMADO`, historial con responsable **Cliente mediante enlace**, reservas y un solo evento `PEDIDO_CONFIRMADO` con la lista de productos.
6. Crear un segundo pedido, enviarlo a `RECIBIDO` y confirmarlo con un usuario interno. Comprobar que el enlace anterior ya no confirma.
7. Crear un tercer pedido y cancelarlo con motivo. Comprobar `PEDIDO_CANCELADO`, el motivo en el mensaje y el enlace revocado.
8. Revisar el resultado de cada entrega en el log de LimiteAPI. Si el proveedor falla, confirmar que el pedido no retrocede y que la notificación queda `REINTENTO` o `FALLIDO` según la configuración.

## Criterio de aprobación

La modificación se acepta cuando PED-WA-01 a PED-WA-11 cumplen el resultado esperado en un entorno de prueba con un número autorizado. No debe usarse un cliente real para la aceptación sin su consentimiento.
