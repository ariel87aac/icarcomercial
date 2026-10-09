import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const marker = `I5-${Date.now().toString(36)}`.toUpperCase();
const db = new pg.Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
const cookies = new Map();
let orderId = null;
let testChannelId = null;

function cookieHeader() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); }
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', headers: { ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookieHeader() ? { cookie: cookieHeader() } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  for (const value of setCookies) { const [pair] = value.split(';'); const index = pair.indexOf('='); cookies.set(pair.slice(0,index),pair.slice(index+1)); }
  const text = await response.text(); let payload; try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}
async function expect(path, options, status) { const result = await request(path, options); assert.equal(result.status, status, `${path}: HTTP ${result.status} ${JSON.stringify(result.payload)}`); return result.payload; }
function passed(code, text) { process.stdout.write(`✓ ${code} ${text}\n`); }

try {
  await db.connect();
  const source = await db.query(`SELECT p.cliente_id, p.domicilio_id, p.creado_por FROM pedidos p WHERE p.estado='CONFIRMADO' ORDER BY p.created_at LIMIT 1`);
  assert(source.rowCount, 'Se requiere al menos un pedido confirmado de referencia');
  orderId = randomUUID();
  await db.query(`INSERT INTO pedidos (id,codigo,cliente_id,domicilio_id,fecha_solicitada,estado,origen,total,creado_por,confirmado_por,confirmado_at) VALUES ($1,$2,$3,$4,current_date,'CONFIRMADO','INTERNO',0,$5,$5,now())`, [orderId, marker, source.rows[0].cliente_id, source.rows[0].domicilio_id, source.rows[0].creado_por]);

  await expect('/api/auth/login', { method:'POST', body:{ identifier:adminIdentifier, password:adminPassword } }, 200);
  const permissions = await expect('/api/permissions', {}, 200);
  assert(permissions.some((item) => item.key === 'tracking.links.manage'));
  assert(permissions.some((item) => item.key === 'notifications.channel.manage'));
  passed('CP-81', 'la migración registra permisos de seguimiento y mensajería');

  const invalid = await request('/api/public/tracking/token-inexistente');
  assert.equal(invalid.status, 404);
  assert.equal(invalid.payload.message, 'El enlace de seguimiento no está disponible');
  passed('CP-83', 'un token inválido devuelve una respuesta pública uniforme');

  const first = await expect(`/api/orders/${orderId}/tracking-link`, { method:'POST', body:{ expiresAt:new Date(Date.now()+86400000).toISOString() } }, 201);
  assert.match(first.url, /^http:\/\/localhost:8080\/seguimiento\/[A-Za-z0-9_-]{40,}$/);
  const firstToken = first.url.split('/').at(-1);
  const stored = await db.query(`SELECT token_hash FROM enlaces_seguimiento WHERE id=$1`, [first.id]);
  assert.equal(stored.rows[0].token_hash.length, 64);
  assert(!stored.rows[0].token_hash.includes(firstToken));
  passed('CP-82', 'el token se muestra una sola vez y PostgreSQL conserva solo el hash');

  const publicState = await expect(`/api/public/tracking/${firstToken}`, {}, 200);
  assert.equal(publicState.protectedReference, marker);
  assert.equal(publicState.status, 'PEDIDO_CONFIRMADO');
  assert(!('customer' in publicState) && !('total' in publicState) && !('address' in publicState));
  passed('CP-84', 'la vista pública expone solo referencia, estado, estimación e historial autorizados');

  const second = await expect(`/api/orders/${orderId}/tracking-link`, { method:'POST', body:{ expiresAt:new Date(Date.now()+172800000).toISOString() } }, 201);
  const secondToken = second.url.split('/').at(-1);
  await expect(`/api/public/tracking/${firstToken}`, {}, 404);
  await expect(`/api/public/tracking/${secondToken}`, {}, 200);
  const activeCount = await db.query(`SELECT count(*)::integer AS value FROM enlaces_seguimiento WHERE pedido_id=$1 AND estado='ACTIVO'`, [orderId]);
  assert.equal(activeCount.rows[0].value, 1);
  passed('CP-85', 'renovar revoca el enlace anterior y deja exactamente uno activo');

  const privateState = await expect(`/api/orders/${orderId}/tracking-link`, {}, 200);
  assert.equal(privateState.tracking.protectedReference, marker);
  assert(!privateState.link.url);
  passed('CP-86', 'la consulta autenticada reutiliza el seguimiento sin volver a revelar el token');

  await expect(`/api/orders/${orderId}/tracking-link`, { method:'DELETE' }, 200);
  await expect(`/api/public/tracking/${secondToken}`, {}, 404);
  passed('CP-87', 'la revocación invalida inmediatamente el enlace público');

  const providerToken = `aceptacion-${marker}-XYZ`;
  const savedChannel = await expect('/api/notification-channel', { method:'POST', body:{ apiUrl:'https://apiqr.limiteflix.com/api/v1/messages/send', token:providerToken, enabledNumber:'59170000000', licenseReference:marker, timeoutMs:10000, maxRetries:0, retryDelaySeconds:60, active:false } }, 201);
  testChannelId = savedChannel.id;
  assert.equal(savedChannel.tokenMasked, '•••••••••XYZ');
  assert.equal(savedChannel.tokenConfigured, true);
  assert(!('token' in savedChannel) && !('encryptedToken' in savedChannel) && !('tokenLast3' in savedChannel));
  const storedChannel = await db.query(`SELECT token_cifrado, token_ultimos_3 FROM configuraciones_canal WHERE id=$1`, [testChannelId]);
  assert.match(storedChannel.rows[0].token_cifrado, /^v1:/);
  assert(!storedChannel.rows[0].token_cifrado.includes(providerToken));
  assert.equal(storedChannel.rows[0].token_ultimos_3, 'XYZ');
  const channel = await expect('/api/notification-channel', {}, 200);
  if (channel) assert(!('token' in channel) && !('encryptedToken' in channel) && !('tokenLast3' in channel));
  const webhook = await request('/api/webhooks/whatsapp', { method:'POST', body:{ eventId:marker, messageId:marker, status:'SENT' } });
  assert([403,503].includes(webhook.status));
  passed('CP-88', 'el token del canal se cifra y la API solo expone una máscara segura');

  process.stdout.write('\n8 comprobaciones de aceptación de la quinta iteración superadas.\n');
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (testChannelId) {
    await db.query(`DELETE FROM eventos_auditoria WHERE entidad='configuraciones_canal' AND entidad_id=$1::text`, [testChannelId]).catch(()=>undefined);
    await db.query(`DELETE FROM configuraciones_canal WHERE id=$1`, [testChannelId]).catch(()=>undefined);
  }
  if (orderId) {
    await db.query(`DELETE FROM eventos_auditoria WHERE entidad_id IN (SELECT id::text FROM enlaces_seguimiento WHERE pedido_id=$1) OR entidad_id=$1::text`, [orderId]).catch(()=>undefined);
    await db.query(`DELETE FROM notificaciones_intentos WHERE notificacion_id IN (SELECT id FROM notificaciones WHERE pedido_id=$1)`, [orderId]).catch(()=>undefined);
    await db.query(`DELETE FROM notificaciones WHERE pedido_id=$1`, [orderId]).catch(()=>undefined);
    await db.query(`DELETE FROM actualizaciones_seguimiento WHERE pedido_id=$1`, [orderId]).catch(()=>undefined);
    await db.query(`DELETE FROM enlaces_seguimiento WHERE pedido_id=$1`, [orderId]).catch(()=>undefined);
    await db.query(`DELETE FROM pedidos WHERE id=$1`, [orderId]).catch(()=>undefined);
  }
  await db.end().catch(()=>undefined);
}
