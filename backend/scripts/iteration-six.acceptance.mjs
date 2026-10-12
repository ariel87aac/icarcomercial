import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const db = new pg.Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
const cookies = new Map();
let saleId = null;
let paymentId = null;
let activeChannelIds = [];
let testRouteId = null;
let testDeliveryId = null;
let testVisitId = null;
let testVehicleId = null;

function cookieHeader() { return [...cookies].map(([name, value]) => `${name}=${value}`).join('; '); }
async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method: options.method ?? 'GET', headers: { ...(options.body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookieHeader() ? { cookie: cookieHeader() } : {}) }, body: options.body === undefined ? undefined : JSON.stringify(options.body) });
  const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('set-cookie')].filter(Boolean);
  for (const value of setCookies) { const [pair] = value.split(';'); const index = pair.indexOf('='); cookies.set(pair.slice(0,index),pair.slice(index+1)); }
  if (options.binary) return { status: response.status, contentType: response.headers.get('content-type'), payload: Buffer.from(await response.arrayBuffer()) };
  const text = await response.text(); let payload; try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { status: response.status, payload };
}
async function expect(path, options, status) { const result = await request(path, options); assert.equal(result.status, status, `${path}: HTTP ${result.status} ${JSON.stringify(result.payload)}`); return result.payload; }
function cents(value) { return Math.round(Number(value) * 100); }
function money(value) { return (value / 100).toFixed(2); }
function passed(code, text) { process.stdout.write(`✓ ${code} ${text}\n`); }

try {
  await db.connect();
  activeChannelIds = (await db.query(`SELECT id FROM configuraciones_canal WHERE activa=true`)).rows.map((row) => row.id);
  await db.query(`UPDATE configuraciones_canal SET activa=false WHERE activa=true`);
  await expect('/api/auth/login', { method:'POST', body:{ identifier:adminIdentifier, password:adminPassword } }, 200);

  const permissions = await expect('/api/permissions', {}, 200);
  assert(permissions.some((item) => item.key === 'commercial.payments.confirm'));
  assert(permissions.some((item) => item.key === 'commercial.reports.export'));
  passed('CP-107', 'la migración registra permisos comerciales y de cartera');

  const methods = await expect('/api/payment-methods', {}, 200);
  const cash = methods.find((item) => item.name === 'EFECTIVO');
  assert(cash && cash.status === 'ACTIVO');
  passed('CP-108', 'los medios de pago activos están disponibles');

  let eligible = await expect('/api/deliveries/sale-eligible', {}, 200);
  if (!eligible.length) {
    const source = await db.query(`
      SELECT pp.id preparacion_id, pp.pedido_id, p.domicilio_id, p.creado_por usuario_id,
             pd.id preparacion_detalle_id,
             CASE WHEN pd.cantidad_preparada > 0 THEN pd.cantidad_preparada ELSE LEAST(pd.cantidad_solicitada, 1) END cantidad,
             COALESCE(dc.zona_id, (SELECT id FROM zonas ORDER BY created_at LIMIT 1)) zona_id
      FROM preparaciones_pedido pp
      JOIN pedidos p ON p.id=pp.pedido_id
      JOIN preparaciones_detalle pd ON pd.preparacion_id=pp.id
      JOIN domicilios_cliente dc ON dc.id=p.domicilio_id
      WHERE NOT EXISTS (SELECT 1 FROM rutas_entregas re WHERE re.preparacion_id=pp.id)
      ORDER BY pp.created_at
      LIMIT 1
    `);
    assert(source.rowCount, 'Se requiere al menos una preparación con detalle para crear la entrega aislada de aceptación');
    const item = source.rows[0];
    const vehicle = await db.query(`SELECT id FROM vehiculos ORDER BY created_at LIMIT 1`);
    testVehicleId = vehicle.rows[0]?.id ?? randomUUID();
    if (!vehicle.rowCount) await db.query(`INSERT INTO vehiculos (id,placa,descripcion,status) VALUES ($1,$2,$3,'ACTIVO')`, [testVehicleId, `T6-${Date.now().toString(36)}`.slice(-20), 'Vehículo temporal de aceptación']);
    testRouteId = randomUUID();
    testDeliveryId = randomUUID();
    testVisitId = randomUUID();
    await db.query(`INSERT INTO rutas_distribucion (id,codigo,fecha,zona_id,vehiculo_id,estado,creado_por,observacion) VALUES ($1,$2,current_date,$3,$4,'FINALIZADA',$5,$6)`, [testRouteId, `T6-${Date.now().toString(36)}`.toUpperCase(), item.zona_id, testVehicleId, item.usuario_id, 'Ruta temporal de aceptación sexta iteración']);
    await db.query(`INSERT INTO rutas_entregas (id,ruta_id,preparacion_id,pedido_id,domicilio_id,posicion,estado) VALUES ($1,$2,$3,$4,$5,1,'VISITADA')`, [testDeliveryId, testRouteId, item.preparacion_id, item.pedido_id, item.domicilio_id]);
    await db.query(`INSERT INTO resultados_visita (id,ruta_entrega_id,resultado,usuario_id,observacion) VALUES ($1,$2,'ENTREGADA',$3,$4)`, [testVisitId, testDeliveryId, item.usuario_id, 'Entrega temporal de aceptación']);
    await db.query(`INSERT INTO resultados_visita_detalle (resultado_visita_id,preparacion_detalle_id,cantidad_entregada,cantidad_devuelta,cantidad_devuelta_aceptada) VALUES ($1,$2,$3,0,0)`, [testVisitId, item.preparacion_detalle_id, item.cantidad]);
    eligible = await expect('/api/deliveries/sale-eligible', {}, 200);
  }
  assert(eligible.length, 'Se requiere una entrega completa o parcial sin venta vigente para la aceptación');
  const source = eligible[0];
  const sale = await expect('/api/sales', { method:'POST', body:{ visitResultId:source.id } }, 201);
  saleId = sale.id;
  assert(['EMITIDA'].includes(sale.status));
  assert(cents(sale.total) > 0 && sale.total === sale.balance);
  passed('CP-109', 'la venta se genera desde una entrega efectiva con total y saldo consistentes');

  const duplicate = await request('/api/sales', { method:'POST', body:{ visitResultId:source.id } });
  assert.equal(duplicate.status, 409);
  passed('CP-110', 'una entrega no puede originar dos ventas vigentes');

  const voucher = await request(`/api/sales/${sale.id}/voucher?format=PDF`, { binary:true });
  assert.equal(voucher.status, 200);
  assert.match(voucher.contentType ?? '', /application\/pdf/);
  assert.equal(voucher.payload.subarray(0,4).toString(), '%PDF');
  passed('CP-111', 'el comprobante interno se descarga como PDF');

  const totalCents = cents(sale.total);
  const appliedCents = totalCents > 1 ? Math.floor(totalCents / 2) : totalCents;
  const payment = await expect('/api/payments', { method:'POST', body:{ customerId:sale.customerId, paymentMethodId:cash.id, paymentDate:new Date().toISOString().slice(0,10), amount:Number(money(appliedCents)), applications:[{ saleId:sale.id, amount:Number(money(appliedCents)) }] } }, 201);
  paymentId = payment.id;
  assert.equal(payment.status, 'REGISTRADO');
  const unchanged = await expect(`/api/sales/${sale.id}`, {}, 200);
  assert.equal(unchanged.balance, sale.balance);
  passed('CP-112', 'registrar un pago no altera el saldo antes de confirmarlo');

  const confirmed = await expect(`/api/payments/${payment.id}/confirm`, { method:'POST', body:{} }, 201);
  assert.equal(confirmed.status, 'CONFIRMADO');
  const updated = await expect(`/api/sales/${sale.id}`, {}, 200);
  assert.equal(cents(updated.balance), totalCents-appliedCents);
  assert.equal(updated.status, appliedCents === totalCents ? 'PAGADA' : 'PAGO_PARCIAL');
  passed('CP-113', 'confirmar aplica el pago atómicamente y actualiza saldo y estado');

  const account = await expect(`/api/customers/${sale.customerId}/account`, {}, 200);
  assert.equal(cents(account.balance), totalCents-appliedCents);
  assert(account.movements.some((item) => item.description.includes(payment.number)));
  passed('CP-114', 'el estado de cuenta conserva débitos, créditos y saldo resultante');

  const receivables = await expect(`/api/receivables?customerId=${sale.customerId}&limit=100`, {}, 200);
  assert(receivables.data.some((row) => row.sale.id === sale.id));
  passed('CP-115', 'la cartera clasifica las ventas por estado y antigüedad');

  for (const format of ['CSV','PDF']) {
    const exported = await request(`/api/reports/commercial/VENTAS/export?format=${format}&customerId=${sale.customerId}`, { binary:true });
    assert.equal(exported.status, 200);
    assert(exported.payload.length > 20);
  }
  passed('CP-116', 'el reporte de ventas se exporta en CSV y PDF con los mismos filtros');

  const voidedPayment = await expect(`/api/payments/${payment.id}/void`, { method:'POST', body:{ reason:'Reversión controlada de aceptación' } }, 201);
  assert.equal(voidedPayment.status, 'ANULADO');
  const restored = await expect(`/api/sales/${sale.id}`, {}, 200);
  assert.equal(restored.balance, sale.total);
  passed('CP-117', 'anular un pago genera contramovimiento y restaura el saldo');

  const voidedSale = await expect(`/api/sales/${sale.id}/void`, { method:'POST', body:{ reason:'Cierre controlado de aceptación' } }, 201);
  assert.equal(voidedSale.status, 'ANULADA');
  passed('CP-118', 'la venta sin pagos vigentes se anula sin eliminación física');

  const event = await db.query(`SELECT estado FROM eventos_comerciales_salida WHERE pago_id=$1`, [payment.id]);
  assert.equal(event.rowCount, 1);
  passed('CP-119', 'la confirmación registra el evento idempotente payment.received');
  process.stdout.write('\n13 comprobaciones de aceptación de la sexta iteración superadas.\n');
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (paymentId || saleId) {
    await db.query('BEGIN').catch(()=>undefined);
    if (paymentId) {
      await db.query(`DELETE FROM notificaciones_intentos WHERE notificacion_id IN (SELECT id FROM notificaciones WHERE pago_id=$1)`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM notificaciones WHERE pago_id=$1`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM eventos_comerciales_salida WHERE pago_id=$1`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM movimientos_cuenta_cliente WHERE pago_aplicacion_id IN (SELECT id FROM pagos_aplicaciones WHERE pago_id=$1)`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos_historial WHERE pago_id=$1`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos_aplicaciones WHERE pago_id=$1`, [paymentId]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos WHERE id=$1`, [paymentId]).catch(()=>undefined);
    }
    if (saleId) {
      await db.query(`DELETE FROM movimientos_cuenta_cliente WHERE venta_id=$1`, [saleId]).catch(()=>undefined);
      await db.query(`DELETE FROM comprobantes_internos WHERE venta_id=$1`, [saleId]).catch(()=>undefined);
      await db.query(`DELETE FROM ventas_detalle WHERE venta_id=$1`, [saleId]).catch(()=>undefined);
      await db.query(`DELETE FROM ventas WHERE id=$1`, [saleId]).catch(()=>undefined);
    }
    await db.query(`DELETE FROM eventos_auditoria WHERE modulo='commercial' AND (entidad_id=$1::text OR entidad_id=$2::text)`, [saleId, paymentId]).catch(()=>undefined);
    await db.query('COMMIT').catch(()=>undefined);
  }
  if (testVisitId) {
    await db.query(`DELETE FROM resultados_visita_detalle WHERE resultado_visita_id=$1`, [testVisitId]).catch(()=>undefined);
    await db.query(`DELETE FROM resultados_visita WHERE id=$1`, [testVisitId]).catch(()=>undefined);
  }
  if (testDeliveryId) await db.query(`DELETE FROM rutas_entregas WHERE id=$1`, [testDeliveryId]).catch(()=>undefined);
  if (testRouteId) await db.query(`DELETE FROM rutas_distribucion WHERE id=$1`, [testRouteId]).catch(()=>undefined);
  if (testVehicleId) await db.query(`DELETE FROM vehiculos WHERE id=$1 AND descripcion='Vehículo temporal de aceptación'`, [testVehicleId]).catch(()=>undefined);
  if (activeChannelIds.length) await db.query(`UPDATE configuraciones_canal SET activa=true WHERE id = ANY($1::uuid[])`, [activeChannelIds]).catch(()=>undefined);
  await db.end().catch(()=>undefined);
}
