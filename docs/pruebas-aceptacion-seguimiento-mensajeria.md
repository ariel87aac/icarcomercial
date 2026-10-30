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

## Evidencia automatizada

- Compilación del backend y verificación de tipos/plantillas del frontend.
- Pruebas unitarias del cifrado de credenciales.
- Pruebas unitarias del adaptador LimiteAPI para solicitud válida, respuesta sanitizada y fallo de conexión.
- Pruebas de aceptación de la quinta iteración para enlaces, privacidad, permisos y protección de secretos.
- Creación local verificada: **8 plantillas nuevas y 2 plantillas activas preservadas**, completando los 10 eventos soportados.
- Recuperación verificada: una notificación interrumpida con intento exitoso se concilió sin generar un nuevo envío.

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
