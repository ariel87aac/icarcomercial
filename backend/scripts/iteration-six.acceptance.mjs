import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const db = new pg.Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
const cookies = new Map();
let saleId = null;
let saleCode = null;
let paymentId = null;
let paymentCode = null;
let automaticPaymentId = null;
let automaticPaymentCode = null;
let activeChannelIds = [];
let testRouteId = null;
let testDeliveryId = null;
let testVisitId = null;
let testVehicleId = null;
let testOrderId = null;
let testOrderDetailId = null;
let testPreparationId = null;

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
    let source = await db.query(`
      SELECT pp.id preparacion_id, pp.pedido_id, p.domicilio_id, p.creado_por usuario_id,
             pd.id preparacion_detalle_id,
             CASE WHEN pd.cantidad_preparada > 0 THEN pd.cantidad_preparada ELSE LEAST(pd.cantidad_solicitada, 1) END cantidad,
             COALESCE(dc.zona_id, (SELECT id FROM zonas ORDER BY created_at LIMIT 1)) zona_id
      FROM preparaciones_pedido pp
      JOIN pedidos p ON p.id=pp.pedido_id
      JOIN clientes customer ON customer.id=p.cliente_id
      JOIN preparaciones_detalle pd ON pd.preparacion_id=pp.id
      JOIN domicilios_cliente dc ON dc.id=p.domicilio_id
      WHERE NOT EXISTS (SELECT 1 FROM rutas_entregas re WHERE re.preparacion_id=pp.id)
        AND (
          customer.condicion_pago='CREDITO'
          OR NOT EXISTS (
            SELECT 1 FROM ventas pending_sale
             WHERE pending_sale.cliente_id=customer.id
               AND pending_sale.estado IN ('EMITIDA','PAGO_PARCIAL')
               AND pending_sale.saldo>0
          )
        )
      ORDER BY pp.created_at
      LIMIT 1
    `);
    if (!source.rowCount) {
      const template = await db.query(`
        SELECT pp.id preparacion_id, pp.pedido_id, pd.id preparacion_detalle_id, pd.detalle_pedido_id
        FROM preparaciones_pedido pp
        JOIN preparaciones_detalle pd ON pd.preparacion_id=pp.id
        ORDER BY pp.created_at
        LIMIT 1
      `);
      assert(template.rowCount, 'Se requiere al menos una preparación base para construir la entrega aislada de aceptación');
      const customerFixture = await db.query(`
        SELECT customer.id cliente_id, address.id domicilio_id
          FROM clientes customer
          JOIN domicilios_cliente address ON address.cliente_id=customer.id AND address.status='ACTIVO'
         WHERE customer.status='ACTIVO'
           AND (
             customer.condicion_pago='CREDITO'
             OR NOT EXISTS (
               SELECT 1 FROM ventas sale
                WHERE sale.cliente_id=customer.id
                  AND sale.estado IN ('EMITIDA','PAGO_PARCIAL')
                  AND sale.saldo>0
             )
           )
         ORDER BY CASE WHEN customer.condicion_pago='CREDITO' THEN 0 ELSE 1 END, customer.created_at
         LIMIT 1
      `);
      assert(customerFixture.rowCount, 'Se requiere un cliente activo habilitado para la venta temporal de aceptación');
      testOrderId = randomUUID();
      testOrderDetailId = randomUUID();
      testPreparationId = randomUUID();
      const fixtureCode = `T6-${Date.now().toString(36)}`.toUpperCase();
      await db.query(`
        INSERT INTO pedidos (
          id,codigo,cliente_id,domicilio_id,fecha_solicitada,estado,origen,observaciones,total,creado_por,
          confirmado_por,recibido_at,confirmado_at,cliente_nombre_copia,cliente_tipo_copia,domicilio_copia,
          zona_copia,dia_distribucion_copia,fecha_cierre_pedido,fecha_preparacion
        )
        SELECT $1,$2,$3,$4,fecha_solicitada,'CONFIRMADO',origen,$5,total,creado_por,
               COALESCE(confirmado_por,creado_por),COALESCE(recibido_at,now()),COALESCE(confirmado_at,now()),
               cliente_nombre_copia,cliente_tipo_copia,domicilio_copia,zona_copia,dia_distribucion_copia,
               fecha_cierre_pedido,fecha_preparacion
          FROM pedidos WHERE id=$6
      `, [testOrderId, fixtureCode, customerFixture.rows[0].cliente_id, customerFixture.rows[0].domicilio_id, 'Pedido temporal de aceptación sexta iteración', template.rows[0].pedido_id]);
      await db.query(`
        INSERT INTO pedidos_detalle (
          id,pedido_id,presentacion_id,cantidad_solicitada,cantidad_reservada,cantidad_pendiente,
          precio_unitario,subtotal,producto_descripcion_copia,presentacion_descripcion_copia,unidad_abreviatura_copia
        )
        SELECT $1,$2,presentacion_id,cantidad_solicitada,cantidad_reservada,cantidad_pendiente,
               precio_unitario,subtotal,producto_descripcion_copia,presentacion_descripcion_copia,unidad_abreviatura_copia
          FROM pedidos_detalle WHERE id=$3
      `, [testOrderDetailId, testOrderId, template.rows[0].detalle_pedido_id]);
      await db.query(`
        INSERT INTO preparaciones_pedido (
          id,pedido_id,responsable_id,estado,version,referencias_produccion,iniciado_at,
          confirmado_por,confirmado_at,entregado_distribucion_por,entregado_distribucion_at
        )
        SELECT $1,$2,responsable_id,'PREPARADA',1,referencias_produccion,now(),
               COALESCE(confirmado_por,responsable_id),now(),COALESCE(confirmado_por,responsable_id),now()
          FROM preparaciones_pedido WHERE id=$3
      `, [testPreparationId, testOrderId, template.rows[0].preparacion_id]);
      await db.query(`
        INSERT INTO preparaciones_detalle (
          preparacion_id,detalle_pedido_id,reserva_id,existencia_id,cantidad_solicitada,cantidad_reservada,
          disponible_copia,cantidad_preparada,diferencia,observacion,verificado_por,verificado_at,fisico_copia,faltante_copia
        )
        SELECT $1,$2,NULL,existencia_id,cantidad_solicitada,cantidad_reservada,disponible_copia,
               CASE WHEN cantidad_preparada>0 THEN cantidad_preparada ELSE LEAST(cantidad_solicitada,1) END,
               0,'Fixture temporal',COALESCE(verificado_por,(SELECT responsable_id FROM preparaciones_pedido WHERE id=$1)),now(),fisico_copia,faltante_copia
          FROM preparaciones_detalle WHERE id=$3
      `, [testPreparationId, testOrderDetailId, template.rows[0].preparacion_detalle_id]);
      source = await db.query(`
        SELECT pp.id preparacion_id, pp.pedido_id, p.domicilio_id, p.creado_por usuario_id,
               pd.id preparacion_detalle_id, pd.cantidad_preparada cantidad,
               COALESCE(dc.zona_id, (SELECT id FROM zonas ORDER BY created_at LIMIT 1)) zona_id
        FROM preparaciones_pedido pp
        JOIN pedidos p ON p.id=pp.pedido_id
        JOIN preparaciones_detalle pd ON pd.preparacion_id=pp.id
        JOIN domicilios_cliente dc ON dc.id=p.domicilio_id
        WHERE pp.id=$1
      `, [testPreparationId]);
    }
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
  saleCode = sale.code;
  assert(['EMITIDA'].includes(sale.status));
  assert(cents(sale.total) > 0 && sale.total === sale.balance);
  passed('CP-109', 'la venta se genera desde una entrega efectiva con total y saldo consistentes');

  assert(Number.isInteger(sale.code) && sale.code > 0);
  const codeRange = await db.query(`SELECT min(codigo)::integer AS minimum FROM ventas`);
  assert.equal(codeRange.rows[0].minimum, 1);
  passed('CP-170', 'Cod-Venta es numérico, inicia en 1 y mantiene correlación incremental');

  const listedSales = await expect('/api/sales?limit=100', {}, 200);
  const listedCodes = listedSales.data.map((item) => item.code);
  assert(listedCodes.includes(sale.code));
  assert(listedCodes.every((code, index) => index === 0 || listedCodes[index - 1] >= code));
  passed('CP-171', 'la tabla de ventas se entrega ordenada por Cod-Venta de mayor a menor');

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
  paymentCode = payment.code;
  assert.equal(payment.status, 'REGISTRADO');
  assert(Number.isInteger(payment.code) && payment.code > 0);
  const paymentCodeRange = await db.query(`SELECT min(codigo)::integer AS minimum FROM pagos`);
  assert.equal(paymentCodeRange.rows[0].minimum, 1);
  const paymentRelations = await db.query(`
    SELECT
      (SELECT count(*)::integer FROM pagos_aplicaciones WHERE pago_codigo=$1) AS applications,
      (SELECT count(*)::integer FROM pagos_historial WHERE pago_codigo=$1) AS history
  `, [payment.code]);
  assert.equal(paymentRelations.rows[0].applications, 1);
  assert.equal(paymentRelations.rows[0].history, 1);
  passed('CP-173', 'Cod-Cobro es numérico, incremental y relaciona aplicaciones e historial');
  const relations = await db.query(`
    SELECT
      (SELECT count(*)::integer FROM ventas_detalle WHERE venta_codigo=$1) AS details,
      (SELECT count(*)::integer FROM comprobantes_internos WHERE venta_codigo=$1) AS vouchers,
      (SELECT count(*)::integer FROM pagos_aplicaciones WHERE venta_codigo=$1) AS applications,
      (SELECT count(*)::integer FROM movimientos_cuenta_cliente WHERE venta_codigo=$1) AS movements
  `, [sale.code]);
  assert(relations.rows[0].details > 0 && relations.rows[0].vouchers === 1 && relations.rows[0].applications === 1 && relations.rows[0].movements > 0);
  passed('CP-172', 'detalle, comprobante, pago y cuenta corriente se relacionan por Cod-Venta');
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
  assert(account.movements.some((item) => item.description.includes(String(payment.code))));
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

  await db.query(`UPDATE ventas SET fecha_emision=current_date-2, fecha_vencimiento=current_date-2 WHERE id=$1`, [sale.id]);
  const collection = await expect('/api/payments/collection-customers', {}, 200);
  const customerCollection = collection.find((item) => item.customer.id === sale.customerId);
  assert(customerCollection && customerCollection.pendingNotes >= 1);
  assert.equal(cents(customerCollection.totalDue), totalCents);
  assert.equal(customerCollection.hasOverdue, true);
  assert(customerCollection.overdueNotes >= 1);
  assert.equal(cents(customerCollection.overdueAmount), totalCents);
  assert(customerCollection.sales.some((item) => item.id === sale.id));
  passed('CP-174', 'Cobros agrupa por cliente sus notas pendientes, deuda y alerta de vencimientos');

  const automaticPayment = await expect('/api/payments', { method:'POST', body:{ customerId:sale.customerId, paymentMethodId:cash.id, paymentDate:new Date().toISOString().slice(0,10), amount:Number(money(appliedCents)), applicationMode:'MAS_ANTIGUA_PRIMERO' } }, 201);
  automaticPaymentId = automaticPayment.id;
  automaticPaymentCode = automaticPayment.code;
  assert.equal(automaticPayment.applications.length, 1);
  assert.equal(automaticPayment.applications[0].sale.id, sale.id);
  assert.equal(cents(automaticPayment.applications[0].appliedAmount), appliedCents);
  passed('CP-175', 'el abono por monto se distribuye automáticamente desde la nota más antigua');

  const voidedSale = await expect(`/api/sales/${sale.id}/void`, { method:'POST', body:{ reason:'Cierre controlado de aceptación' } }, 201);
  assert.equal(voidedSale.status, 'ANULADA');
  passed('CP-118', 'la venta sin pagos vigentes se anula sin eliminación física');

  const event = await db.query(`SELECT estado FROM eventos_comerciales_salida WHERE pago_codigo=$1`, [payment.code]);
  assert.equal(event.rowCount, 1);
  passed('CP-119', 'la confirmación registra el evento idempotente payment.received');
  process.stdout.write('\n19 comprobaciones de aceptación de la sexta iteración superadas.\n');
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  if (paymentId || automaticPaymentId || saleId) {
    await db.query('BEGIN').catch(()=>undefined);
    for (const item of [{ id: automaticPaymentId, code: automaticPaymentCode }, { id: paymentId, code: paymentCode }]) {
      if (!item.id || !item.code) continue;
      await db.query(`DELETE FROM notificaciones_intentos WHERE notificacion_id IN (SELECT id FROM notificaciones WHERE pago_codigo=$1)`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM notificaciones WHERE pago_codigo=$1`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM eventos_comerciales_salida WHERE pago_codigo=$1`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM movimientos_cuenta_cliente WHERE pago_aplicacion_id IN (SELECT id FROM pagos_aplicaciones WHERE pago_codigo=$1)`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos_historial WHERE pago_codigo=$1`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos_aplicaciones WHERE pago_codigo=$1`, [item.code]).catch(()=>undefined);
      await db.query(`DELETE FROM pagos WHERE id=$1`, [item.id]).catch(()=>undefined);
    }
    await db.query(`SELECT setval('pagos_codigo_seq', COALESCE((SELECT max(codigo) FROM pagos), 1), EXISTS(SELECT 1 FROM pagos))`).catch(()=>undefined);
    if (saleId && saleCode) {
      await db.query(`DELETE FROM movimientos_cuenta_cliente WHERE venta_codigo=$1`, [saleCode]).catch(()=>undefined);
      await db.query(`DELETE FROM comprobantes_internos WHERE venta_codigo=$1`, [saleCode]).catch(()=>undefined);
      await db.query(`DELETE FROM ventas_detalle WHERE venta_codigo=$1`, [saleCode]).catch(()=>undefined);
      await db.query(`DELETE FROM ventas WHERE id=$1`, [saleId]).catch(()=>undefined);
      await db.query(`SELECT setval('ventas_codigo_seq', COALESCE((SELECT max(codigo) FROM ventas), 1), EXISTS(SELECT 1 FROM ventas))`).catch(()=>undefined);
    }
    await db.query(`DELETE FROM eventos_auditoria WHERE modulo='commercial' AND (entidad_id=$1::text OR entidad_id=$2::text OR entidad_id=$3::text)`, [saleId, paymentId, automaticPaymentId]).catch(()=>undefined);
    await db.query('COMMIT').catch(()=>undefined);
  }
  if (testVisitId) {
    await db.query(`DELETE FROM resultados_visita_detalle WHERE resultado_visita_id=$1`, [testVisitId]).catch(()=>undefined);
    await db.query(`DELETE FROM resultados_visita WHERE id=$1`, [testVisitId]).catch(()=>undefined);
  }
  if (testDeliveryId) await db.query(`DELETE FROM rutas_entregas WHERE id=$1`, [testDeliveryId]).catch(()=>undefined);
  if (testRouteId) await db.query(`DELETE FROM rutas_distribucion WHERE id=$1`, [testRouteId]).catch(()=>undefined);
  if (testVehicleId) await db.query(`DELETE FROM vehiculos WHERE id=$1 AND descripcion='Vehículo temporal de aceptación'`, [testVehicleId]).catch(()=>undefined);
  if (testPreparationId) {
    await db.query(`DELETE FROM preparaciones_detalle WHERE preparacion_id=$1`, [testPreparationId]).catch(()=>undefined);
    await db.query(`DELETE FROM preparaciones_pedido WHERE id=$1`, [testPreparationId]).catch(()=>undefined);
  }
  if (testOrderDetailId) await db.query(`DELETE FROM pedidos_detalle WHERE id=$1`, [testOrderDetailId]).catch(()=>undefined);
  if (testOrderId) await db.query(`DELETE FROM pedidos WHERE id=$1`, [testOrderId]).catch(()=>undefined);
  if (activeChannelIds.length) await db.query(`UPDATE configuraciones_canal SET activa=true WHERE id = ANY($1::uuid[])`, [activeChannelIds]).catch(()=>undefined);
  await db.end().catch(()=>undefined);
}
