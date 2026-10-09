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
- `GET|POST /api/notification-channel`
- `GET /api/notifications`
- `GET /api/notifications/{id}`
- `POST /api/notifications/{id}/resend`
- `POST /api/webhooks/whatsapp`

`PAGO_RECIBIDO` está definido como contrato reservado, pero se rechaza su activación y no se emite en esta iteración.

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

La prueba valida permisos, respuesta uniforme para tokens inválidos, almacenamiento exclusivo del hash, privacidad pública, renovación, unicidad del enlace activo, consulta autenticada, revocación y protección de secretos. Las pruebas unitarias comprueban además el cifrado y descifrado del token del canal.
