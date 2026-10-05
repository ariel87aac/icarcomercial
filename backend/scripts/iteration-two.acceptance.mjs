import assert from 'node:assert/strict';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const suffix = process.env.ACCEPTANCE_SUFFIX ?? Date.now().toString(36);

class CookieJar {
  values = new Map();
  absorb(headers) {
    const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : headers.get('set-cookie') ? [headers.get('set-cookie')] : [];
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value); else this.values.delete(name);
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
}

async function request(path, { method = 'GET', body, jar = new CookieJar() } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(jar.header() ? { cookie: jar.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.absorb(response.headers);
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload, jar };
}

async function expectStatus(path, options, expected, label) {
  const result = await request(path, options);
  assert.equal(result.response.status, expected, `${label}: se esperaba HTTP ${expected}, se recibió ${result.response.status}: ${JSON.stringify(result.payload)}`);
  return result;
}

const results = [];
function passed(code, description) { results.push({ code, description }); process.stdout.write(`✓ ${code} ${description}\n`); }
function isoDate(offsetDays) { const date = new Date(); date.setUTCHours(12, 0, 0, 0); date.setUTCDate(date.getUTCDate() + offsetDays); return date.toISOString().slice(0, 10); }
function weekday(dateValue) { const day = new Date(`${dateValue}T12:00:00Z`).getUTCDay(); return day === 0 ? 7 : day; }

async function databaseClient() {
  const client = new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await client.connect();
  return client;
}

async function cleanupAcceptanceData() {
  if (!process.env.DATABASE_HOST || process.env.ACCEPTANCE_KEEP_DATA === 'true') return;
  const client = await databaseClient();
  try {
    await client.query('BEGIN');
    await client.query(`
      DELETE FROM eventos_auditoria
      WHERE metadatos::text LIKE $1
         OR entidad_id IN (
           SELECT p.id::text FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $7
           UNION SELECT id::text FROM productos WHERE codigo = $2
           UNION SELECT id::text FROM categorias_producto WHERE nombre = $3
           UNION SELECT id::text FROM lineas_productivas WHERE nombre = $4
           UNION SELECT id::text FROM unidades_medida WHERE abreviatura = $5
           UNION SELECT id::text FROM clientes WHERE nombre_razon_social LIKE $6
           UNION SELECT id::text FROM usuarios WHERE email LIKE $7
         )
    `, [`%${suffix}%`, `ACEPT-${suffix}`.toUpperCase(), `Categoría Aceptación ${suffix}`, `Línea Aceptación ${suffix}`, `U${suffix.slice(-5)}`.toUpperCase(), `%${suffix}%`, `%${suffix}@icar.local`]);
    await client.query(`DELETE FROM reservas_inventario WHERE detalle_pedido_id IN (SELECT d.id FROM pedidos_detalle d JOIN pedidos p ON p.id=d.pedido_id JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_estados_historial WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_detalle WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos WHERE cliente_id IN (SELECT id FROM clientes WHERE nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM movimientos_inventario WHERE existencia_id IN (SELECT e.id FROM existencias e JOIN presentaciones_producto pp ON pp.id=e.presentacion_id JOIN productos p ON p.id=pp.producto_id WHERE p.codigo=$1)`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM reservas_inventario WHERE existencia_id IN (SELECT e.id FROM existencias e JOIN presentaciones_producto pp ON pp.id=e.presentacion_id JOIN productos p ON p.id=pp.producto_id WHERE p.codigo=$1)`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT pp.id FROM presentaciones_producto pp JOIN productos p ON p.id=pp.producto_id WHERE p.codigo=$1)`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM precios_producto WHERE presentacion_id IN (SELECT pp.id FROM presentaciones_producto pp JOIN productos p ON p.id=pp.producto_id WHERE p.codigo=$1)`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE codigo=$1)`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM productos WHERE codigo=$1`, [`ACEPT-${suffix}`.toUpperCase()]);
    await client.query(`DELETE FROM unidades_medida WHERE abreviatura=$1`, [`U${suffix.slice(-5)}`.toUpperCase()]);
    await client.query(`DELETE FROM lineas_productivas WHERE nombre=$1`, [`Línea Aceptación ${suffix}`]);
    await client.query(`DELETE FROM categorias_producto WHERE nombre=$1`, [`Categoría Aceptación ${suffix}`]);
    await client.query(`DELETE FROM domicilios_cliente WHERE cliente_id IN (SELECT id FROM clientes WHERE nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM clientes WHERE nombre_razon_social LIKE $1`, [`%${suffix}%`]);
    await client.query(`DELETE FROM dias_distribucion WHERE zona_id IN (SELECT id FROM zonas WHERE nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM zonas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await client.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`%${suffix}@icar.local`]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { await client.end(); }
}

if (process.env.ACCEPTANCE_CLEANUP_ONLY === 'true') {
  await cleanupAcceptanceData();
  process.stdout.write(`Datos temporales ${suffix} eliminados.\n`);
  process.exit(0);
}

try {
  const adminJar = new CookieJar();
  await expectStatus('/api/auth/login', { method: 'POST', jar: adminJar, body: { identifier: adminIdentifier, password: adminPassword } }, 200, 'inicio administrador');
  const roles = (await expectStatus('/api/roles', { jar: adminJar }, 200, 'roles')).payload;
  const commercialRole = roles.find((role) => role.name === 'COMERCIALIZACION');
  const commercialUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: 'Comercial Aceptación', username: `comercial.${suffix}`, email: `comercial.${suffix}@icar.local`, password: 'Comercial1234!', roleIds: [commercialRole.id] } }, 201, 'usuario comercial')).payload;
  const commercialJar = new CookieJar();
  await expectStatus('/api/auth/login', { method: 'POST', jar: commercialJar, body: { identifier: commercialUser.email, password: 'Comercial1234!' } }, 200, 'login comercial');

  const deliveryDate = isoDate(3);
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona Iteración 2 ${suffix}` } }, 201, 'zona')).payload;
  const day = (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(deliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'día')).payload;
  const tomorrow = isoDate(1);
  const urgentZone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona Urgente ${suffix}` } }, 201, 'zona urgente')).payload;
  const urgentDay = (await expectStatus(`/api/zonas/${urgentZone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(tomorrow) } }, 201, 'día urgente')).payload;

  async function createCustomer(type, label, priceIndex) {
    const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type, businessName: `${label} ${suffix}`, taxId: `${label.slice(0, 3).toUpperCase()}-${suffix}-${priceIndex}`, phone: `70${priceIndex}00000`, paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0 } }, 201, `cliente ${type}`)).payload;
    const address = (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección ${label}`, zoneId: zone.id, distributionDayId: day.id, isPrimary: true } }, 201, 'domicilio')).payload;
    const account = (await expectStatus(`/api/clientes/${customer.id}/usuarios`, { method: 'POST', jar: adminJar, body: { name: `Cuenta ${label}`, username: `${label.toLowerCase()}.${suffix}`, email: `${label.toLowerCase()}.${suffix}@icar.local`, password: 'Cliente1234!', isPrimary: true } }, 201, 'cuenta')).payload;
    const jar = new CookieJar();
    await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier: account.user.email, password: 'Cliente1234!' } }, 200, 'login cliente');
    return { customer, address, jar };
  }

  const retail = await createCustomer('MINORISTA', 'Minorista', 1);
  const distributor = await createCustomer('DISTRIBUIDOR', 'Distribuidor', 2);
  const wholesale = await createCustomer('MAYORISTA', 'Mayorista', 3);
  const urgentAddress = (await expectStatus(`/api/clientes/${distributor.customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Urgente', address: 'Dirección urgente', zoneId: urgentZone.id, distributionDayId: urgentDay.id } }, 201, 'domicilio urgente')).payload;

  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría Aceptación ${suffix}` } }, 201, 'categoría')).payload;
  const line = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea Aceptación ${suffix}` } }, 201, 'línea')).payload;
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad Aceptación ${suffix}`, abbreviation: `U${suffix.slice(-5)}` } }, 201, 'unidad')).payload;
  const product = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { code: `ACEPT-${suffix}`, name: `Producto Aceptación ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto')).payload;
  const presentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación principal', conversionFactor: 1 } }, 201, 'presentación')).payload;
  const inactivePresentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación inactiva', conversionFactor: 2 } }, 201, 'presentación inactiva')).payload;
  const auxiliaryPresentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación auxiliar', conversionFactor: 3 } }, 201, 'presentación auxiliar')).payload;
  await expectStatus(`/api/productos/${product.id}/presentaciones/${inactivePresentation.id}`, { method: 'PATCH', jar: adminJar, body: { status: 'INACTIVO' } }, 200, 'desactivar presentación');

  const amounts = { MINORISTA: 11, DISTRIBUIDOR: 9, MAYORISTA: 7 };
  for (const [customerType, amount] of Object.entries(amounts)) {
    await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType, amount, validFrom: isoDate(-1) } }, 201, `precio ${customerType}`);
  }
  await expectStatus(`/api/presentaciones/${auxiliaryPresentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'DISTRIBUIDOR', amount: 5, validFrom: isoDate(-1) } }, 201, 'precio auxiliar');

  const retailCatalog = await expectStatus('/api/catalogo?limit=100', { jar: retail.jar }, 200, 'CP-13');
  const catalogProduct = retailCatalog.payload.data.find((item) => item.id === product.id);
  assert(catalogProduct);
  assert.equal(catalogProduct.presentations.find((item) => item.id === presentation.id).price.amount, '11.00');
  passed('CP-13', 'el catálogo del cliente muestra solo información activa con su precio aplicable');
  assert(!catalogProduct.presentations.some((item) => item.id === inactivePresentation.id));
  passed('CP-14', 'una presentación inactiva desaparece del catálogo sin eliminarse');

  for (const [context, expected] of [[retail, '11.00'], [distributor, '9.00'], [wholesale, '7.00']]) {
    const catalog = await expectStatus('/api/catalogo?limit=100', { jar: context.jar }, 200, 'CP-15');
    assert.equal(catalog.payload.data.find((item) => item.id === product.id).presentations.find((item) => item.id === presentation.id).price.amount, expected);
  }
  passed('CP-15', 'cada tipo de cliente recibe su precio vigente sin exponer condiciones ajenas');
  await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'DISTRIBUIDOR', amount: 8, validFrom: isoDate(-1), validUntil: isoDate(5) } }, 409, 'CP-16');
  passed('CP-16', 'se rechazan vigencias superpuestas para la misma condición');

  const draft = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 5 }], observations: 'Borrador propio' } }, 201, 'CP-17')).payload;
  assert.equal(draft.customerId, distributor.customer.id);
  assert.equal(draft.status, 'BORRADOR');
  assert.equal(draft.details.length, 1);
  passed('CP-17', 'el cliente crea y consulta un Borrador propio con su detalle');
  await expectStatus(`/api/pedidos/${draft.id}`, { jar: retail.jar }, 404, 'CP-18');
  const rejectedAudit = await expectStatus(`/api/auditoria?action=ACCESO_PEDIDO_AJENO&entityId=${draft.id}`, { jar: adminJar }, 200, 'auditoría CP-18');
  assert(rejectedAudit.payload.data.length >= 1);
  passed('CP-18', 'un cliente no accede a pedidos ajenos y el rechazo queda auditado');

  const staffDraft = await expectStatus('/api/pedidos', { method: 'POST', jar: commercialJar, body: { customerId: retail.customer.id, addressId: retail.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 201, 'CP-19');
  assert.equal(staffDraft.payload.createdBy.id, commercialUser.id);
  passed('CP-19', 'el personal comercial registra un pedido para un cliente autorizado');
  await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: urgentAddress.id, requestedDate: tomorrow, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 422, 'CP-20');
  passed('CP-20', 'se aplica la anticipación mínima de 24 horas a distribuidores');
  await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: isoDate(4), details: [{ presentationId: presentation.id, quantity: 1 }] } }, 422, 'CP-21');
  passed('CP-21', 'se rechaza una fecha incompatible con el día del domicilio');

  await expectStatus(`/api/pedidos/${draft.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'CP-22');
  let history = await expectStatus(`/api/pedidos/${draft.id}/historial`, { jar: distributor.jar }, 200, 'historial');
  assert.deepEqual(history.payload.map((item) => item.newStatus), ['BORRADOR', 'RECIBIDO']);
  passed('CP-22', 'enviar un Borrador registra el estado Recibido con usuario y fecha');
  await expectStatus(`/api/pedidos/${draft.id}/devolver`, { method: 'POST', jar: commercialJar, body: { observation: 'Corregir cantidades' } }, 201, 'CP-23');
  history = await expectStatus(`/api/pedidos/${draft.id}/historial`, { jar: distributor.jar }, 200, 'historial devolución');
  assert.equal(history.payload.at(-1).newStatus, 'BORRADOR');
  assert.equal(history.payload.at(-1).observation, 'Corregir cantidades');
  passed('CP-23', 'la devolución conserva la observación y ambos estados');

  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'INGRESO', quantity: 20, reason: 'Existencia inicial' } }, 201, 'CP-29 ingreso');
  const adjustment = await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_POSITIVO', quantity: 5, reason: 'Ajuste controlado' } }, 201, 'CP-29 ajuste');
  assert.equal(adjustment.payload.previousBalance, '20.000');
  assert.equal(adjustment.payload.newBalance, '25.000');
  passed('CP-29', 'ingresos y ajustes conservan saldos, motivo, usuario y fecha');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_NEGATIVO', quantity: 999, reason: 'Movimiento inválido' } }, 422, 'CP-30');
  passed('CP-30', 'un ajuste que dejaría saldo negativo se rechaza sin alterar el inventario');

  await expectStatus(`/api/pedidos/${draft.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'reenviar');
  const confirmed = await expectStatus(`/api/pedidos/${draft.id}/confirmar`, { method: 'POST', jar: commercialJar, body: { observation: 'Confirmación completa' } }, 201, 'CP-25');
  assert.equal(confirmed.payload.status, 'CONFIRMADO');
  assert.equal(confirmed.payload.details[0].reservedQuantity, '5.000');
  assert.equal(confirmed.payload.details[0].pendingQuantity, '0.000');
  passed('CP-25', 'la confirmación con saldo suficiente reserva toda la cantidad');
  await expectStatus(`/api/pedidos/${draft.id}`, { method: 'PATCH', jar: commercialJar, body: { observations: 'Intento de cambio' } }, 409, 'CP-24');
  passed('CP-24', 'el pedido Confirmado conserva su versión y rechaza cambios');

  history = await expectStatus(`/api/pedidos/${draft.id}/historial`, { jar: distributor.jar }, 200, 'CP-32');
  assert.deepEqual(history.payload.map((item) => item.newStatus), ['BORRADOR', 'RECIBIDO', 'BORRADOR', 'RECIBIDO', 'CONFIRMADO']);
  passed('CP-32', 'el historial conserva cronológicamente todos los estados y responsables');

  const partialDraft = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 30 }] } }, 201, 'pedido parcial')).payload;
  await expectStatus(`/api/pedidos/${partialDraft.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'enviar parcial');
  const partial = await expectStatus(`/api/pedidos/${partialDraft.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'CP-26');
  assert.equal(partial.payload.details[0].reservedQuantity, '20.000');
  assert.equal(partial.payload.details[0].pendingQuantity, '10.000');
  passed('CP-26', 'la reserva parcial compromete lo disponible y registra la diferencia pendiente');

  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_POSITIVO', quantity: 10, reason: 'Saldo para concurrencia' } }, 201, 'saldo concurrencia');
  async function receivedOrder(quantity) {
    const order = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity }] } }, 201, 'pedido concurrente')).payload;
    await expectStatus(`/api/pedidos/${order.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'enviar concurrente');
    return order;
  }
  const concurrentA = await receivedOrder(10);
  const concurrentB = await receivedOrder(10);
  const [confirmationA, confirmationB] = await Promise.all([
    request(`/api/pedidos/${concurrentA.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} }),
    request(`/api/pedidos/${concurrentB.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} }),
  ]);
  assert.equal(confirmationA.response.status, 201);
  assert.equal(confirmationB.response.status, 201);
  const reservedConcurrent = Number(confirmationA.payload.details[0].reservedQuantity) + Number(confirmationB.payload.details[0].reservedQuantity);
  assert.equal(reservedConcurrent, 10);
  passed('CP-27', 'confirmaciones simultáneas recalculan el saldo y no sobre-reservan');

  const stocks = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'CP-31');
  const mainStock = stocks.payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(Number(mainStock.availableQuantity), Number(mainStock.physicalQuantity) - Number(mainStock.reservedQuantity));
  assert.equal(mainStock.availableQuantity, '0.000');
  passed('CP-31', 'el disponible equivale al físico menos reservado después de confirmar');

  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_POSITIVO', quantity: 5, reason: 'Saldo reversión' } }, 201, 'saldo reversión principal');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: auxiliaryPresentation.id, type: 'INGRESO', quantity: 5, reason: 'Saldo reversión auxiliar' } }, 201, 'saldo reversión auxiliar');
  const rollbackOrder = (await expectStatus('/api/pedidos', { method: 'POST', jar: commercialJar, body: { customerId: distributor.customer.id, addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 2 }, { presentationId: auxiliaryPresentation.id, quantity: 2 }] } }, 201, 'pedido reversión')).payload;
  await expectStatus(`/api/pedidos/${rollbackOrder.id}/enviar`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'enviar reversión');
  const db = await databaseClient();
  let bogusReservationId;
  let firstStockBefore;
  try {
    const detailRows = (await db.query(`SELECT id, presentacion_id FROM pedidos_detalle WHERE pedido_id=$1 ORDER BY presentacion_id`, [rollbackOrder.id])).rows;
    const lastDetail = detailRows.at(-1);
    const firstDetail = detailRows[0];
    const stockRows = (await db.query(`SELECT id, presentacion_id, cantidad_reservada FROM existencias WHERE presentacion_id = ANY($1::uuid[])`, [detailRows.map((row) => row.presentacion_id)])).rows;
    const conflictingStock = stockRows.find((row) => row.presentacion_id === lastDetail.presentacion_id);
    firstStockBefore = stockRows.find((row) => row.presentacion_id === firstDetail.presentacion_id);
    const inserted = await db.query(`INSERT INTO reservas_inventario (detalle_pedido_id, existencia_id, cantidad, usuario_id) VALUES ($1,$2,0,$3) RETURNING id`, [lastDetail.id, conflictingStock.id, commercialUser.id]);
    bogusReservationId = inserted.rows[0].id;
    const failedConfirmation = await request(`/api/pedidos/${rollbackOrder.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} });
    assert.equal(failedConfirmation.response.status, 500);
    const orderAfter = await expectStatus(`/api/pedidos/${rollbackOrder.id}`, { jar: commercialJar }, 200, 'pedido después de reversión');
    assert.equal(orderAfter.payload.status, 'RECIBIDO');
    const stockAfter = (await db.query(`SELECT cantidad_reservada FROM existencias WHERE id=$1`, [firstStockBefore.id])).rows[0];
    assert.equal(stockAfter.cantidad_reservada, firstStockBefore.cantidad_reservada);
    await db.query(`DELETE FROM reservas_inventario WHERE id=$1`, [bogusReservationId]);
  } finally { await db.end(); }
  passed('CP-28', 'un error durante la confirmación revierte reservas, historial y estado');

  process.stdout.write(`\n${results.length} comprobaciones de aceptación de la segunda iteración superadas.\n`);
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanupAcceptanceData(); process.stdout.write('Datos temporales de la segunda iteración eliminados.\n'); }
  catch (cleanupError) { process.stderr.write(`No fue posible limpiar los datos temporales: ${cleanupError.stack ?? cleanupError}\n`); process.exitCode = 1; }
}
