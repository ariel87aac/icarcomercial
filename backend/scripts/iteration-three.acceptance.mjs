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
    await client.query('DROP TRIGGER IF EXISTS acceptance_block_production_audit ON eventos_auditoria');
    await client.query('DROP FUNCTION IF EXISTS acceptance_block_production_audit()');
    await client.query('BEGIN');
    await client.query(`DELETE FROM registros_avance_produccion WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1) OR detalle_consolidado_id IN (SELECT detail.id FROM consolidaciones_detalle detail JOIN consolidaciones_produccion consolidation ON consolidation.id=detail.consolidacion_id WHERE consolidation.generado_por IN (SELECT id FROM usuarios WHERE email LIKE $1))`, [`%${suffix}@icar.local`]);
    await client.query(`DELETE FROM consolidaciones_produccion WHERE generado_por IN (SELECT id FROM usuarios WHERE email LIKE $1)`, [`%${suffix}@icar.local`]);
    await client.query(`DELETE FROM eventos_auditoria WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1) OR metadatos::text LIKE $2`, [`%${suffix}@icar.local`, `%${suffix}%`]);
    await client.query(`DELETE FROM reservas_inventario WHERE detalle_pedido_id IN (SELECT detail.id FROM pedidos_detalle detail JOIN pedidos orders ON orders.id=detail.pedido_id JOIN clientes customer ON customer.id=orders.cliente_id WHERE customer.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_estados_historial WHERE pedido_id IN (SELECT orders.id FROM pedidos orders JOIN clientes customer ON customer.id=orders.cliente_id WHERE customer.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_detalle WHERE pedido_id IN (SELECT orders.id FROM pedidos orders JOIN clientes customer ON customer.id=orders.cliente_id WHERE customer.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos WHERE cliente_id IN (SELECT id FROM clientes WHERE nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM movimientos_inventario WHERE existencia_id IN (SELECT stock.id FROM existencias stock JOIN presentaciones_producto presentation ON presentation.id=stock.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`I3-${suffix.toUpperCase()}%`]);
    await client.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`I3-${suffix.toUpperCase()}%`]);
    await client.query(`DELETE FROM precios_producto WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`I3-${suffix.toUpperCase()}%`]);
    await client.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE codigo LIKE $1)`, [`I3-${suffix.toUpperCase()}%`]);
    await client.query(`DELETE FROM productos WHERE codigo LIKE $1`, [`I3-${suffix.toUpperCase()}%`]);
    await client.query(`DELETE FROM unidades_medida WHERE abreviatura LIKE $1`, [`I3${suffix.slice(-4).toUpperCase()}%`]);
    await client.query(`DELETE FROM lineas_productivas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await client.query(`DELETE FROM categorias_producto WHERE nombre LIKE $1`, [`%${suffix}%`]);
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
  const productionRole = roles.find((role) => role.name === 'PRODUCCION');
  const managementRole = roles.find((role) => role.name === 'GERENCIA');
  assert(commercialRole && productionRole && managementRole, 'faltan roles documentados de la tercera iteración');

  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría Iteración 3 ${suffix}` } }, 201, 'categoría')).payload;
  const lineA = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea A ${suffix}` } }, 201, 'línea A')).payload;
  const lineB = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea B ${suffix}` } }, 201, 'línea B')).payload;
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Kilogramo Iteración 3 ${suffix}`, abbreviation: `I3${suffix.slice(-4)}KG`.toUpperCase(), decimalScale: 3 } }, 201, 'unidad')).payload;
  assert.equal(unit.decimalScale, 3);
  const productA = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { code: `I3-${suffix}-A`.toUpperCase(), name: `Producto A ${suffix}`, categoryId: category.id, productLineId: lineA.id, baseUnitId: unit.id } }, 201, 'producto A')).payload;
  const productB = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { code: `I3-${suffix}-B`.toUpperCase(), name: `Producto B ${suffix}`, categoryId: category.id, productLineId: lineB.id, baseUnitId: unit.id } }, 201, 'producto B')).payload;
  const presentationA = (await expectStatus(`/api/productos/${productA.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Unidad A', conversionFactor: 1 } }, 201, 'presentación A')).payload;
  const boxA = (await expectStatus(`/api/productos/${productA.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Caja A', conversionFactor: 2 } }, 201, 'caja A')).payload;
  const presentationB = (await expectStatus(`/api/productos/${productB.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Unidad B', conversionFactor: 1 } }, 201, 'presentación B')).payload;
  await expectStatus(`/api/productos/${productA.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Factor inválido', conversionFactor: 0 } }, 400, 'CP-38');
  passed('CP-38', 'se rechaza de forma controlada una presentación sin factor de conversión válido');

  const commercialUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Comercial I3 ${suffix}`, username: `i3.com.${suffix}`, email: `i3.com.${suffix}@icar.local`, password: 'Comercial1234!', roleIds: [commercialRole.id] } }, 201, 'usuario comercial')).payload;
  const productionUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Producción I3 ${suffix}`, username: `i3.prod.${suffix}`, email: `i3.prod.${suffix}@icar.local`, password: 'Produccion1234!', roleIds: [productionRole.id] } }, 201, 'usuario producción')).payload;
  const scopedUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Producción Línea A ${suffix}`, username: `i3.scope.${suffix}`, email: `i3.scope.${suffix}@icar.local`, password: 'Produccion1234!', roleIds: [productionRole.id], productLineIds: [lineA.id] } }, 201, 'usuario producción restringido')).payload;
  const managementUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Gerencia I3 ${suffix}`, username: `i3.mgmt.${suffix}`, email: `i3.mgmt.${suffix}@icar.local`, password: 'Gerencia1234!', roleIds: [managementRole.id] } }, 201, 'usuario gerencia')).payload;
  async function login(identifier, password) { const jar = new CookieJar(); await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier, password } }, 200, `login ${identifier}`); return jar; }
  const commercialJar = await login(commercialUser.email, 'Comercial1234!');
  const productionJar = await login(productionUser.email, 'Produccion1234!');
  const scopedJar = await login(scopedUser.email, 'Produccion1234!');
  const managementJar = await login(managementUser.email, 'Gerencia1234!');

  // Usar un rango futuro propio de la ejecución evita colisiones con datos
  // locales de demostración que también poseen consolidaciones principales.
  const acceptanceDateOffset = 400 + [...suffix].reduce((total, character) => total + character.charCodeAt(0), 0) % 300;
  const dates = [0, 1, 2, 3, 4, 5].map((offset) => isoDate(acceptanceDateOffset + offset));
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona Iteración 3 ${suffix}` } }, 201, 'zona')).payload;
  const days = new Map();
  for (const date of dates) {
    const value = weekday(date);
    if (!days.has(value)) days.set(value, (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: value, startTime: '08:00', endTime: '17:00' } }, 201, 'día distribución')).payload);
  }
  const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type: 'MINORISTA', businessName: `Cliente Iteración 3 ${suffix}`, taxId: `I3-${suffix}`, phone: '70000000', paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0 } }, 201, 'cliente')).payload;
  const addresses = new Map();
  for (const [dayValue, distributionDay] of days) {
    addresses.set(dayValue, (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: `Entrega día ${dayValue}`, address: `Dirección Iteración 3 ${suffix} día ${dayValue}`, zoneId: zone.id, distributionDayId: distributionDay.id, isPrimary: dayValue === weekday(dates[0]) } }, 201, 'domicilio')).payload);
  }
  for (const presentation of [presentationA, boxA, presentationB]) {
    await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'MINORISTA', amount: 10, validFrom: isoDate(-1) } }, 201, 'precio');
  }
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentationA.id, type: 'INGRESO', quantity: 100, reason: `Control producción ${suffix}` } }, 201, 'existencia inicial');

  async function confirmedOrder(date, details, observation = '') {
    const order = (await expectStatus('/api/pedidos', { method: 'POST', jar: commercialJar, body: { customerId: customer.id, addressId: addresses.get(weekday(date)).id, requestedDate: date, details, observations: observation || undefined } }, 201, 'pedido')).payload;
    await expectStatus(`/api/pedidos/${order.id}/enviar`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'enviar pedido');
    return (await expectStatus(`/api/pedidos/${order.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'confirmar pedido')).payload;
  }

  const orderA1 = await confirmedOrder(dates[0], [{ presentationId: boxA.id, quantity: 2 }], 'Caja convertida');
  const orderA2 = await confirmedOrder(dates[0], [{ presentationId: presentationA.id, quantity: 1.25 }, { presentationId: presentationB.id, quantity: 3 }], 'Dos líneas');
  await confirmedOrder(dates[1], [{ presentationId: presentationA.id, quantity: 10 }], 'Fecha distinta');
  const stockBefore = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${productA.id}`, { jar: adminJar }, 200, 'existencia previa')).payload.data.find((row) => row.presentationId === presentationA.id);

  let main = (await expectStatus('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[0] } }, 201, 'generación principal')).payload;
  const detailA = main.details.find((detail) => detail.productId === productA.id);
  const detailB = main.details.find((detail) => detail.productId === productB.id);
  assert(detailA && detailB);
  assert.equal(Number(detailA.requestedQuantity), 5.25);
  assert.equal(detailA.sources.length, 2);
  passed('CP-33', 'agrupa pedidos Confirmados de la misma fecha, línea, producto y unidad base');
  assert(!main.details.some((detail) => detail.sources.some((source) => source.orderDetail.order.requestedDate === dates[1])));
  passed('CP-34', 'mantiene separadas las fechas de entrega');
  assert.notEqual(detailA.productLineId, detailB.productLineId);
  passed('CP-35', 'mantiene separadas las líneas productivas');
  assert.equal(Number(detailA.sources.find((source) => source.orderDetailId === orderA1.details[0].id).baseContribution), 4);
  passed('CP-36', 'convierte cada presentación a la unidad base antes de sumar');
  assert.deepEqual(new Set(detailA.sources.map((source) => source.orderDetailId)), new Set([orderA1.details[0].id, orderA2.details.find((detail) => detail.presentationId === presentationA.id).id]));
  passed('CP-37', 'conserva la trazabilidad desde el total hasta cada detalle de pedido');

  const sourceIdsBefore = main.details.flatMap((detail) => detail.sources.map((source) => source.orderDetailId)).sort();
  main = (await expectStatus(`/api/production-consolidations/${main.id}/recalculate`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'recálculo')).payload;
  assert.deepEqual(main.details.flatMap((detail) => detail.sources.map((source) => source.orderDetailId)).sort(), sourceIdsBefore);
  assert.equal(Number(main.details.find((detail) => detail.productId === productA.id).requestedQuantity), 5.25);
  await expectStatus('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[0] } }, 409, 'generación repetida');
  passed('CP-39', 'el recálculo es idempotente y una principal repetida no duplica fuentes');

  main = (await expectStatus(`/api/production-consolidations/${main.id}/emit`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'emisión')).payload;
  assert.equal(main.status, 'EMITIDA');
  await expectStatus(`/api/production-consolidations/${main.id}/recalculate`, { method: 'POST', jar: commercialJar, body: {} }, 409, 'inmutabilidad emitida');
  passed('CP-41', 'la versión Emitida queda inmutable');

  const lateOrder = await confirmedOrder(dates[0], [{ presentationId: presentationA.id, quantity: 2 }], 'Confirmación posterior');
  const complementary = (await expectStatus('/api/production-consolidations/complementary', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[0] } }, 201, 'complementaria')).payload;
  assert.equal(complementary.type, 'COMPLEMENTARIA');
  assert.deepEqual(complementary.details.flatMap((detail) => detail.sources.map((source) => source.orderDetailId)), [lateOrder.details[0].id]);
  passed('CP-42', 'una confirmación posterior se incorpora únicamente en una versión complementaria');

  const date2Main = (await expectStatus('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[1] } }, 201, 'principal fecha 2')).payload;
  let exact = (await expectStatus(`/api/production-consolidations/${date2Main.id}/emit`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'emitir fecha 2')).payload;
  const exactDetailId = exact.details[0].id;
  assert.equal(Number(exact.details[0].difference), -10);
  passed('CP-43', 'calcula pendiente y diferencia desde solicitado y preparado');
  exact = (await expectStatus(`/api/production-consolidations/${exact.id}/progress`, { method: 'POST', jar: productionJar, body: { consolidatedDetailId: exactDetailId, quantity: 4, observation: 'Primer avance parcial' } }, 201, 'primer avance')).payload;
  assert.equal(exact.status, 'EN_PROCESO');
  passed('CP-44', 'el primer avance válido cambia Emitida a En proceso');
  exact = (await expectStatus(`/api/production-consolidations/${exact.id}/progress`, { method: 'POST', jar: productionJar, body: { consolidatedDetailId: exactDetailId, quantity: 6, observation: 'Segundo avance parcial' } }, 201, 'segundo avance')).payload;
  assert.equal(Number(exact.details[0].preparedQuantity), 10);
  assert.equal(Number(exact.details[0].difference), 0);
  passed('CP-45', 'los avances parciales son acumulativos y recalculan la diferencia');
  exact = (await expectStatus(`/api/production-consolidations/${exact.id}/close`, { method: 'POST', jar: productionJar, body: {} }, 201, 'cierre exacto')).payload;
  assert.equal(exact.status, 'CERRADA');
  passed('CP-46', 'permite cierre sin observación cuando no existe diferencia');

  await confirmedOrder(dates[2], [{ presentationId: presentationA.id, quantity: 10 }], 'Faltante');
  let shortage = (await expectStatus('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[2] } }, 201, 'principal faltante')).payload;
  shortage = (await expectStatus(`/api/production-consolidations/${shortage.id}/emit`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'emitir faltante')).payload;
  shortage = (await expectStatus(`/api/production-consolidations/${shortage.id}/progress`, { method: 'POST', jar: productionJar, body: { consolidatedDetailId: shortage.details[0].id, quantity: 7, observation: 'Producción parcial' } }, 201, 'avance faltante')).payload;
  await expectStatus(`/api/production-consolidations/${shortage.id}/close`, { method: 'POST', jar: productionJar, body: {} }, 422, 'cierre faltante sin observación');
  shortage = (await expectStatus(`/api/production-consolidations/${shortage.id}/close`, { method: 'POST', jar: productionJar, body: { observation: 'Faltaron 3 unidades por capacidad' } }, 201, 'cierre faltante')).payload;
  assert.equal(Number(shortage.details[0].difference), -3);
  passed('CP-47', 'el faltante queda negativo y exige observación de cierre');

  await confirmedOrder(dates[3], [{ presentationId: presentationA.id, quantity: 10 }], 'Excedente');
  let excess = (await expectStatus('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[3] } }, 201, 'principal excedente')).payload;
  excess = (await expectStatus(`/api/production-consolidations/${excess.id}/emit`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'emitir excedente')).payload;
  excess = (await expectStatus(`/api/production-consolidations/${excess.id}/progress`, { method: 'POST', jar: productionJar, body: { consolidatedDetailId: excess.details[0].id, quantity: 12.5, observation: 'Lote completo' } }, 201, 'avance excedente')).payload;
  excess = (await expectStatus(`/api/production-consolidations/${excess.id}/close`, { method: 'POST', jar: productionJar, body: { observation: 'Excedente de lote' } }, 201, 'cierre excedente')).payload;
  assert.equal(Number(excess.details[0].difference), 2.5);
  passed('CP-48', 'el excedente queda positivo y se preserva con su observación');

  const exactHistory = (await expectStatus(`/api/production-consolidations/${exact.id}/history`, { jar: productionJar }, 200, 'historial')).payload;
  assert.deepEqual(exactHistory.map((event) => event.event), ['GENERACION', 'EMISION', 'INICIO', 'AVANCE', 'AVANCE', 'CIERRE']);
  assert(exactHistory.every((event) => event.user?.id && event.occurredAt));
  assert(exactHistory.some((event) => event.observation === 'Primer avance parcial'));
  passed('CP-49', 'preserva la secuencia de estados y eventos de la consolidación');
  passed('CP-50', 'el historial identifica usuario, fecha y observaciones de cada avance');

  await expectStatus(`/api/production-consolidations/${main.id}/progress`, { method: 'POST', jar: commercialJar, body: { consolidatedDetailId: main.details[0].id, quantity: 1 } }, 403, 'comercial sin avance');
  await expectStatus('/api/production-consolidations', { method: 'POST', jar: productionJar, body: { deliveryDate: dates[5] } }, 403, 'producción sin generar');
  await expectStatus('/api/production-summary?limit=100', { jar: managementJar }, 200, 'gerencia consulta');
  await expectStatus(`/api/production-consolidations/${main.id}/progress`, { method: 'POST', jar: managementJar, body: { consolidatedDetailId: main.details[0].id, quantity: 1 } }, 403, 'gerencia solo lectura');
  passed('CP-51', 'la matriz de permisos separa Comercial, Producción y Gerencia');

  await confirmedOrder(dates[4], [{ presentationId: presentationA.id, quantity: 2 }], 'Concurrencia A');
  await confirmedOrder(dates[4], [{ presentationId: boxA.id, quantity: 1 }], 'Concurrencia B');
  const [generationA, generationB] = await Promise.all([
    request('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[4] } }),
    request('/api/production-consolidations', { method: 'POST', jar: commercialJar, body: { deliveryDate: dates[4] } }),
  ]);
  assert.deepEqual([generationA.response.status, generationB.response.status].sort(), [201, 409]);
  const concurrent = generationA.response.status === 201 ? generationA.payload : generationB.payload;
  assert.equal(concurrent.details[0].sources.length, 2);
  passed('CP-40', 'dos generaciones concurrentes no duplican versiones ni fuentes');

  const db = await databaseClient();
  try {
    await db.query(`CREATE FUNCTION acceptance_block_production_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'EMITIR_CONSOLIDACION' THEN RAISE EXCEPTION 'fallo controlado de aceptación'; END IF; RETURN NEW; END $$`);
    await db.query(`CREATE TRIGGER acceptance_block_production_audit BEFORE INSERT ON eventos_auditoria FOR EACH ROW EXECUTE FUNCTION acceptance_block_production_audit()`);
    const failedEmission = await request(`/api/production-consolidations/${concurrent.id}/emit`, { method: 'POST', jar: commercialJar, body: {} });
    assert.equal(failedEmission.response.status, 500);
    const afterFailure = await expectStatus(`/api/production-consolidations/${concurrent.id}`, { jar: commercialJar }, 200, 'estado tras reversión');
    assert.equal(afterFailure.payload.status, 'BORRADOR');
    const historyAfterFailure = await expectStatus(`/api/production-consolidations/${concurrent.id}/history`, { jar: commercialJar }, 200, 'historial tras reversión');
    assert(!historyAfterFailure.payload.some((event) => event.event === 'EMISION'));
  } finally {
    await db.query('DROP TRIGGER IF EXISTS acceptance_block_production_audit ON eventos_auditoria');
    await db.query('DROP FUNCTION IF EXISTS acceptance_block_production_audit()');
    await db.end();
  }
  passed('CP-52', 'un fallo dentro de la emisión revierte estado, historial y auditoría');

  const summary = await expectStatus(`/api/production-summary?limit=100&deliveryDate=${dates[0]}&productLineId=${lineA.id}`, { jar: managementJar }, 200, 'resumen filtrado');
  assert(summary.payload.data.length >= 2);
  assert(
    summary.payload.data.every((row) => String(row.deliveryDate).slice(0, 10) === dates[0] && row.productLineId === lineA.id),
    `resumen fuera de filtro: ${JSON.stringify(summary.payload.data)}`,
  );
  passed('CP-53', 'el resumen filtra por fecha y línea mostrando solicitado, preparado, pendiente y diferencia');

  const scopedMain = await expectStatus(`/api/production-consolidations/${main.id}`, { jar: scopedJar }, 200, 'consulta restringida');
  assert(scopedMain.payload.details.every((detail) => detail.productLineId === lineA.id));
  await expectStatus(`/api/production-summary?limit=100&productLineId=${lineB.id}`, { jar: scopedJar }, 403, 'línea no autorizada');
  passed('CP-54', 'el alcance por línea productiva oculta y rechaza información no autorizada');

  const stockAfter = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${productA.id}`, { jar: adminJar }, 200, 'existencia posterior')).payload.data.find((row) => row.presentationId === presentationA.id);
  assert.equal(stockAfter.physicalQuantity, stockBefore.physicalQuantity);

  process.stdout.write(`\n${results.length} comprobaciones de aceptación de la tercera iteración superadas.\n`);
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanupAcceptanceData(); process.stdout.write('Datos temporales de la tercera iteración eliminados.\n'); }
  catch (cleanupError) { process.stderr.write(`No fue posible limpiar los datos temporales: ${cleanupError.stack ?? cleanupError}\n`); process.exitCode = 1; }
}
