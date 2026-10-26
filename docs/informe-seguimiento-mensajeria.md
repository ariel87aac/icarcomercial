# Informe de revisión: seguimiento y mensajería

Fecha de revisión: 25 de octubre de 2026.

## Resultado general

El módulo compila, inicia correctamente en Docker y conserva las medidas principales de seguridad. Se agregó una prueba manual de LimiteAPI con registro persistente de respuestas. La entrega real a WhatsApp no se ejecutó durante la revisión para evitar enviar mensajes a un tercero sin una validación manual del destinatario.

## Implementación agregada

- Formulario de prueba en **Seguimiento y mensajería → Canal** con número y mensaje editables.
- Envío directo de un solo intento usando el canal activo guardado.
- Presentación inmediata de resultado, código HTTP, duración, identificador del proveedor y error.
- Registro persistente de las últimas pruebas con respuesta JSON sanitizada.
- Destinatario almacenado enmascarado; no se almacena el cuerpo enviado ni el token.
- Permiso `notifications.channel.manage` para ejecutar y `notifications.channel.read` para consultar registros.
- Auditoría `PROBAR_CANAL` sin número completo, cuerpo ni credencial.

## Componentes verificados como funcionales

| Componente | Evidencia | Estado |
| --- | --- | --- |
| Compilación backend | `npm run build` | Funcional |
| Compilación frontend | Compilación completa en la imagen Docker | Funcional, con advertencias de tamaño preexistentes |
| Inicio de servicios | Backend, frontend y PostgreSQL saludables | Funcional |
| Migraciones | `AddChannelTestLogs1720000027000` aplicada | Funcional |
| Cifrado del token | AES-256-GCM, máscara con últimos tres caracteres | Funcional |
| Formato LimiteAPI | `POST`, Bearer, JSON `number` y `body` | Funcional en prueba unitaria |
| Manejo de desconexión | Devuelve diagnóstico sin revelar detalles internos | Funcional en prueba unitaria |
| Sanitización | Elimina token, claves API, contraseñas, cookies, secretos y credenciales incluso con guiones o guiones bajos | Funcional |
| Enlaces protegidos | Generación, renovación, hash, revocación y privacidad | Funcional en aceptación |
| Registro de pruebas | Tabla, consulta paginada, máscara y permisos | Funcional |
| Interfaz Canal | Configuración, prueba y tabla de respuestas visibles | Funcional |

Resultado automatizado: 6 archivos de prueba y 13 pruebas unitarias aprobadas; 9 comprobaciones de aceptación de la quinta iteración aprobadas.

## Estado operativo encontrado en la base local

- Existe un canal activo y tiene token cifrado configurado.
- Existe una plantilla activa: `PAGO_RECIBIDO`.
- No existen plantillas activas para confirmación, preparación, salida, próxima entrega o resultado de entrega.
- No existen configuraciones vigentes de estimación global ni por zona.
- No existen notificaciones, enlaces de seguimiento activos ni webhooks procesados en el momento de la revisión.
- No existen pruebas reales registradas todavía.

## Funcionalidad pendiente o no operativa actualmente

1. **Webhook de WhatsApp:** `WHATSAPP_WEBHOOK_TOKEN` no está configurado. El endpoint existe y protege el acceso, pero devuelve indisponibilidad hasta definir el secreto. Sin webhook no puede confirmarse automáticamente si LimiteAPI marcó un mensaje como entregado o fallido.
2. **Mensajes automáticos de pedidos:** el código y el trabajador asincrónico existen, pero no se generarán mensajes para eventos de pedidos mientras no se creen y activen sus plantillas.
3. **Estimación horaria:** el cálculo existe, pero no mostrará un rango hasta registrar una configuración global o por zona.
4. **Prueba de entrega real:** falta presionar **Enviar prueba** con un número autorizado y confirmar que el mensaje llega a WhatsApp. Esta acción debe realizarse conscientemente porque envía un mensaje real.
5. **Recuperación de elementos en `PROCESANDO`:** si el backend se detiene exactamente después de tomar una notificación y antes de finalizar el intento, no existe actualmente una recuperación automática por antigüedad. Conviene agregarla antes de trabajar con más de una instancia o considerar el servicio crítico.
6. **Límite público distribuido:** el límite de consultas de seguimiento se mantiene en memoria. Es suficiente para la instancia actual, pero varias réplicas necesitarían un almacenamiento compartido para aplicar un límite global.

## Pasos para completar la validación operativa

1. Configurar `WHATSAPP_WEBHOOK_TOKEN` en el entorno del VPS y reiniciar el backend.
2. Crear y activar las plantillas de eventos de pedido requeridas.
3. Registrar una configuración global de estimación y, cuando corresponda, ajustes por zona.
4. Desde **Canal**, confirmar URL, token y timeout guardados.
5. Indicar un número autorizado, enviar el mensaje de prueba y revisar la respuesta registrada.
6. Ejecutar un pedido de prueba hasta distribución y comprobar la secuencia: cola, intento, ID del proveedor y webhook.
