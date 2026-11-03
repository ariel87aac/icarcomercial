# Pruebas de aceptación: seguimiento y mensajería

## Alcance de la modificación

Se agregó a **Seguimiento y mensajería → Canal** una prueba manual de LimiteAPI y un registro persistente de sus resultados. La prueba utiliza exclusivamente el canal activo guardado y realiza un solo intento para que su resultado represente la conectividad real sin afectar la cola de notificaciones operativas.

## Casos de aceptación agregados

| Caso | Acción | Resultado esperado |
| --- | --- | --- |
| CP-89 | Abrir la pestaña Canal con permiso de lectura. | Se muestra el registro de pruebas más reciente sin exponer el token ni números completos. |
| CP-90 | Intentar enviar una prueba sin permiso `notifications.channel.manage`. | La interfaz no muestra la acción y la API rechaza el envío por permisos. |
| CP-91 | Ingresar un número de 8 a 15 dígitos y un mensaje, con canal activo y credencial válida. | Se realiza un único `POST` a LimiteAPI con `number` y `body`, y se registra resultado, HTTP, duración e identificador del proveedor. |
| CP-92 | Recibir una respuesta HTTP de error de LimiteAPI. | La pantalla muestra el error y el registro conserva el código HTTP y la respuesta sanitizada. |
| CP-93 | No poder establecer conexión o superar el tiempo de espera. | La prueba finaliza como `ERROR`, indica que no hubo respuesta HTTP y conserva el diagnóstico de conexión. |
| CP-94 | Revisar el registro en base de datos y por API. | El destinatario aparece enmascarado, no se guarda el cuerpo de prueba y no se expone el token. |
| CP-95 | Ejecutar una prueba manual. | No se crea una notificación de pedido, no se ejecutan reintentos y no se altera el procesamiento normal de la cola. |
| CP-96 | Presionar **Crear plantillas base** con permiso de administración. | Se crean plantillas activas para los eventos sin configuración y se conservan las plantillas activas existentes. |
| CP-97 | Repetir **Crear plantillas base**. | No se duplican plantillas; todos los eventos existentes se informan como conservados. |
| CP-98 | Enviar un pedido de `BORRADOR` a `RECIBIDO`. | Se encola un único mensaje `PEDIDO_RECIBIDO` con cliente, código, productos, total y fecha de entrega. |
| CP-99 | Consultar las plantillas después de crear el catálogo. | Se muestran Borrador, Recibido, Confirmado, Cancelado, cambio relevante, salida, próxima entrega, entregado, entrega no completada y pago recibido. |
| CP-100 | Reiniciar el backend con una notificación en `PROCESANDO`. | Un intento exitoso se concilia como `ENVIADO` sin duplicarlo; un fallo recuperable vuelve a la cola y un resultado indeterminado queda `FALLIDO` para revisión manual. |
| CP-101 | Abrir Plantillas con permiso `notifications.templates.manage`. | Todas las tarjetas, activas e históricas, muestran la acción **Editar**. |
| CP-102 | Presionar **Editar** en cualquier plantilla. | El formulario carga evento, referencia, variables y cuerpo; evento, referencia y siguiente versión quedan protegidos para conservar la identidad del mensaje. |
| CP-103 | Modificar el cuerpo y presionar **Guardar cambios**. | Se crea una nueva versión activa, la versión anterior se conserva, las demás plantillas activas del mismo evento se desactivan y la operación queda auditada. |
| CP-104 | Cancelar la edición. | Se limpia el formulario sin crear versiones ni modificar la plantilla seleccionada. |
| CP-105 | LimiteAPI acepta el mensaje de la cola. | Se registra el intento, la notificación cambia de `PROCESANDO` a `ENVIADO` y no se intenta desvincular el registro de intento. |
| CP-106 | LimiteAPI devuelve un error recuperable. | El intento queda registrado y la notificación cambia a `REINTENTO` con su próxima fecha, sin quedar bloqueada en `PROCESANDO`. |
| CP-107 | Devolver un pedido recibido a borrador, modificarlo y volver a enviarlo. | Se genera un nuevo mensaje `PEDIDO_RECIBIDO` para la nueva transición, sin duplicar mensajes por reintentos de la misma transición. |
| CP-108 | Crear o actualizar un pedido mientras permanece en borrador. | No se genera WhatsApp hasta presionar **Enviar pedido**. |
| CP-109 | Enviar una notificación a un cliente con código `+591` y teléfono local de ocho dígitos. | El destinatario enviado a LimiteAPI combina ambos valores, por ejemplo `59169413721`. |
| CP-110 | Enviar una notificación cuando el teléfono ya incluye `591` o comienza con `+591`. | El sistema normaliza el número y no duplica el código de país. |
| CP-111 | LimiteAPI responde con `providerMessageId`. | El identificador se guarda en la notificación y queda disponible para correlacionar respuestas y webhooks. |
| CP-112 | Presionar **Deshabilitar envío** en Canal. | El estado queda auditado como deshabilitado, la configuración y el token se conservan, las pruebas quedan bloqueadas y cualquier pendiente o reintento previo se cierra sin envío. |
| CP-113 | Generar eventos de pedidos o cobros con el canal deshabilitado y después habilitarlo. | Los eventos ocurridos durante la desactivación no crean notificaciones ni quedan esperando; después de habilitar sólo se encolan mensajes de eventos nuevos. |
| CP-114 | Abrir y guardar la configuración mientras el envío está deshabilitado. | La API devuelve la configuración más reciente aunque esté inactiva, la interfaz conserva URL, número y máscara del token, y permite guardar sin exigir nuevamente la credencial. |

## Evidencia automatizada

- Compilación del backend y verificación de tipos/plantillas del frontend.
- Pruebas unitarias del cifrado de credenciales.
- Pruebas unitarias del adaptador LimiteAPI para solicitud válida, respuesta sanitizada y fallo de conexión.
- Pruebas de aceptación de la quinta iteración para enlaces, privacidad, permisos y protección de secretos.
- Creación local verificada: **8 plantillas nuevas y 2 plantillas activas preservadas**, completando los 10 eventos soportados.
- Recuperación verificada: una notificación interrumpida con intento exitoso se concilió sin generar un nuevo envío.
- Corrección de cola verificada el 1 de noviembre de 2026: **38 pruebas unitarias aprobadas**, compilación aprobada y control de archivos de máximo 300 líneas aprobado.
- Configuración local verificada: **15 eventos habilitados y 15 plantillas activas**. No quedaron notificaciones en `PROCESANDO`.
- El reinicio concilió los resultados ya registrados sin reenviarlos: siete intentos aceptados quedaron `ENVIADO` y un intento histórico HTTP 401 quedó `FALLIDO` para revisión manual.

La entrega efectiva a WhatsApp debe comprobarse manualmente con un token y un número válidos desde la nueva pantalla, porque la automatización no debe enviar mensajes reales a terceros.

## Checks de envío por evento

| Caso | Resultado esperado | Evidencia |
| --- | --- | --- |
| Deshabilitar borrador y generar pedido | No busca ni recrea plantilla para enviar | Prueba unitaria aprobada |
| Deshabilitar salida o evento de seguimiento | No consulta plantilla ni encola mensaje | Prueba unitaria aprobada |
| Deshabilitar cobro | No genera mensaje automático | Prueba unitaria aprobada |
| Habilitar evento | Consulta la plantilla activa del evento | Prueba unitaria aprobada |
| Consultar preferencias | Devuelve todos los eventos y conserva valor deshabilitado; los no configurados siguen habilitados | Prueba unitaria aprobada |
| Guardar y recargar pantalla | Conserva check y registra auditoría | Pendiente de integración |
| Usuario sin permiso de gestión | No puede cambiar configuración | Pendiente de integración |
| Crear plantillas base con envío deshabilitado | No reactiva la preferencia | Pendiente de integración |
| Evento deshabilitado con seguimiento activo | Cambia estado e historial sin WhatsApp | Pendiente de integración |

Comando ejecutado: `cd backend && npm test -- src/modules/tracking/notification-event-settings.spec.ts` (5 pruebas aprobadas). No se enviaron mensajes reales.

## Actualización: flujo unificado de pedidos — 29 de octubre de 2026

La prioridad por fecha de creación, cobertura por detalle, preparación completa, traspaso, historial desde borrador, turno dinámico y checks por estado se documentan en [Implementación del flujo unificado](./implementacion-flujo-unificado-pedidos.md). La evidencia ejecutada y las reglas que sustituyen los casos anteriores están en [Pruebas del flujo unificado](./pruebas-aceptacion-flujo-unificado-pedidos.md).
