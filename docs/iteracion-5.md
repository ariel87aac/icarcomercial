# Quinta iteración: seguimiento y mensajería WhatsApp

La quinta iteración implementa el seguimiento público protegido de pedidos y la mensajería WhatsApp mediante LimiteAPI. Reutiliza los estados y hechos operativos de pedidos, preparación y distribución; no incorpora GPS, optimización automática de rutas, cobros ni cuentas por cobrar.

## Flujo implementado

1. Atención al Cliente genera o renueva un enlace para un pedido confirmado.
2. El sistema entrega el token una sola vez y guarda únicamente su hash SHA-256.
3. La página pública expone la referencia del pedido, el estado visible, las paradas previas pendientes, el rango horario referencial y la última actualización.
4. La confirmación, la preparación, la secuencia, la salida y los resultados de visita actualizan la proyección de seguimiento.
5. Los eventos con plantilla activa generan una notificación idempotente en la cola PostgreSQL.
6. El trabajador asincrónico envía a LimiteAPI sin bloquear la operación comercial o de distribución.
7. Los webhooks actualizan el estado a enviado, entregado o fallido y se deduplican por identificador externo y hash de contenido.

## Plantillas base por estado

La pestaña **Plantillas** permite crear de forma idempotente el catálogo base sin reemplazar una plantilla activa configurada manualmente. El catálogo incluye:

- `PEDIDO_BORRADOR`: detalle, total, fecha de entrega y enlace de confirmación;
- `PEDIDO_RECIBIDO`: constancia de recepción y detalle en revisión;
- `PEDIDO_CONFIRMADO`: lista final de productos confirmados;
- `PEDIDO_CANCELADO`: referencia y motivo de cancelación;
- `CAMBIO_RELEVANTE`, `SALIDA_RUTA` y `PROXIMA_ENTREGA`;
- `ENTREGADO` y `ENTREGA_NO_COMPLETADA`;
- `PAGO_RECIBIDO`.

El botón **Crear plantillas base** sólo agrega los eventos que no tienen una plantilla activa. La acción queda auditada con la cantidad creada y la cantidad preservada. El cambio `BORRADOR → RECIBIDO` ahora encola también su mensaje específico mediante la misma política idempotente de los demás estados.

Los estados públicos son `PEDIDO_CONFIRMADO`, `EN_PREPARACION`, `PREPARADO`, `EN_RUTA`, `ENTREGADO` y `ENTREGA_NO_COMPLETADA`.

## LimiteAPI

El adaptador ejecuta:

```http
POST https://apiqr.limiteflix.com/api/v1/messages/send
Authorization: Bearer <token configurado>
Content-Type: application/json
```

```json
{
  "number": "5917XXXXXXXX",
  "body": "Hola desde LimiteAPI"
}
```

La URL, el token, el número habilitado, la referencia de licencia, el tiempo de espera y la política de reintentos se administran en **Seguimiento y mensajería → Canal**. El token se almacena cifrado con AES-256-GCM, nunca se devuelve completo al navegador y la pantalla muestra únicamente una máscara con sus últimos tres caracteres. El secreto del webhook permanece fuera de la interfaz.

La misma pantalla incorpora un diagnóstico manual. Un usuario con `notifications.channel.manage` puede indicar un número y un texto, y enviar un único mensaje usando la configuración activa guardada. Esta prueba no ingresa a la cola de pedidos ni ejecuta reintentos. El resultado conserva código HTTP, duración, identificador del proveedor, error y respuesta sanitizada. El número se almacena enmascarado y nunca se registra el token ni el cuerpo enviado.

Variables de entorno:

```dotenv
PUBLIC_APP_URL=http://localhost:8080
LIMITE_API_URL=https://apiqr.limiteflix.com/api/v1/messages/send
CHANNEL_CREDENTIALS_KEY=
WHATSAPP_WEBHOOK_TOKEN=
NOTIFICATION_WORKER_POLL_MS=5000
PUBLIC_TRACKING_RATE_LIMIT=30
PUBLIC_TRACKING_RATE_WINDOW_MS=60000
```

`CHANNEL_CREDENTIALS_KEY` permite usar una clave dedicada para cifrar el token. Si queda vacía, el sistema deriva la clave desde `JWT_SECRET`. Hasta que el canal tenga un token válido configurado desde la interfaz, la cola conservará la trazabilidad del fallo sin revelar la credencial ni afectar las operaciones del pedido.

## Estimación referencial

Antes de la salida no se muestra un rango. Después de la salida:

- Sin visitas previas: `salida + (posición - 1) × promedio por parada`.
- Con visitas previas: `última visita + paradas previas pendientes × promedio por parada`.
- Al centro calculado se aplica la tolerancia configurada hacia ambos lados.

Puede existir una configuración global y otra vigente por zona; la configuración de zona tiene prioridad.

## Servicios

- `POST /api/orders/{id}/tracking-link`
- `DELETE /api/orders/{id}/tracking-link`
- `GET /api/orders/{id}/tracking-link`
- `GET /api/public/tracking/{token}`
- `POST /api/tracking-events`
- `GET|POST /api/tracking-settings`
- `GET|POST /api/notification-templates`
- `POST /api/notification-templates/defaults`
- `GET|POST /api/notification-channel`
- `POST /api/notification-channel/test`
- `GET /api/notification-channel/test-logs`
- `GET /api/notifications`
- `GET /api/notifications/{id}`
- `POST /api/notifications/{id}/resend`
- `POST /api/webhooks/whatsapp`

`PAGO_RECIBIDO` se integra con la sexta iteración y utiliza la misma administración de plantillas y cola.

## Perfiles y permisos

- Cliente: seguimiento autenticado de sus propios pedidos.
- Atención al Cliente: enlaces, historial y reenvío autorizado.
- Distribución: lectura operativa.
- Gerencia: lectura de seguimiento, plantillas, configuración e historial.
- Gerencia Financiera: supervisión y configuración funcional del canal.
- Administrador: administración integral.

La migración crea los perfiles `ATENCION_CLIENTE` y `GERENCIA_FINANCIERA`, además de los permisos `tracking.*` y `notifications.*`.

## Verificación

```bash
docker compose exec backend node scripts/iteration-five.acceptance.mjs
```

La prueba valida permisos, respuesta uniforme para tokens inválidos, almacenamiento exclusivo del hash, privacidad pública, renovación, unicidad del enlace activo, consulta autenticada, revocación y protección de secretos. Las pruebas unitarias comprueban además el cifrado y descifrado del token del canal, el formato enviado a LimiteAPI, la sanitización de respuestas y el diagnóstico de fallos de conexión. Las pruebas automatizadas no envían mensajes reales.

## Configuración de envío por evento

Se incorpora en **Seguimiento y mensajería → Plantillas** un check por evento existente para habilitar o deshabilitar sus futuros mensajes automáticos de WhatsApp. La configuración es global, independiente de la versión y activación de las plantillas. Crear plantillas base o confirmar un pedido no reactiva un envío deshabilitado.

- Lectura: `GET /api/notification-event-settings`, permiso `notifications.templates.read`.
- Escritura: `POST /api/notification-event-settings`, cuerpo `{ event, enabled }`, permiso `notifications.templates.manage`.
- Persistencia: migración `1720000049000-add-notification-event-settings.ts`, tabla `notificaciones_eventos_configuracion`.
- Cada cambio de configuración registra usuario, evento y valor en auditoría, en la misma transacción.
- Para mantener compatibilidad, los eventos sin configuración explícita conservan el envío habilitado; sigue siendo necesaria una plantilla válida y el resto de condiciones del canal.
- Se aplica a mensajes de ciclo comercial, seguimiento y cobros. No modifica el historial, los enlaces, el estado del pedido, las notificaciones ya en cola, el diagnóstico manual del canal ni el reenvío manual autorizado.
- Deshabilitar no genera mensajes pendientes de recuperar: volver a habilitar afecta únicamente a eventos futuros.
- Las nuevas etapas definidas en [Flujo del pedido y seguimiento](./flujo-pedido-seguimiento-definicion.md) aún requieren implementar sus eventos específicos. Actualmente Cambios relevantes agrupa los cambios operativos sin evento propio; no equivale a un check independiente por cada nueva etapa.

Verificación: backend compilado y cinco pruebas unitarias de preferencias aprobadas en `notification-event-settings.spec.ts`. La aplicación de la migración y la verificación visual/integrada quedan pendientes; no se enviaron WhatsApp reales.

Validación adicional: compilador Angular (`ngc -p tsconfig.app.json --noEmit`) aprobado; seis pruebas unitarias aprobadas al incluir el diagnóstico de canal. El empaquetado `ng build` terminó con código 134 sin diagnóstico adicional en este entorno. Docker no fue accesible por permisos, por lo que no se aplicó la migración ni se verificó la interfaz en ejecución.
