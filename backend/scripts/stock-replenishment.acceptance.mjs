import assert from 'node:assert/strict';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const identifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const suffix = process.env.ACCEPTANCE_SUFFIX ?? Date.now().toString(36);
const createdStockRequestIds = [];

class CookieJar {
  values = new Map();
  absorb(headers) {
    const cookies = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : headers.get('set-cookie') ? [headers.get('set-cookie')] : [];
    for (const cookie of cookies) {
      const [pair] = cookie.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value); else this.values.delete(name);
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join('; '); }
}

async function request(path, { method = 'GET', body, jar } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(jar?.header() ? { cookie: jar.header() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar?.absorb(response.headers);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  return { response, payload };
}

async function expectStatus(path, options, expected, label) {
  const result = await request(path, options);
  assert.equal(result.response.status, expected, `${label}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`);
  return result.payload;
}

function futureDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1400 + [...suffix].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 400);
  return date.toISOString().slice(0, 10);
}

async function cleanup() {
  if (!process.env.DATABASE_HOST || process.env.ACCEPTANCE_KEEP_DATA === 'true') return;
  const db = new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`DELETE FROM eventos_auditoria WHERE entidad='solicitudes_abastecimiento' AND entidad_id IN (SELECT request.id::text FROM solicitudes_abastecimiento request JOIN solicitudes_abastecimiento_detalle detail ON detail.solicitud_id=request.id JOIN presentaciones_producto presentation ON presentation.id=detail.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`UPDATE solicitudes_abastecimiento SET estado='ENVIADA', consolidacion_produccion_id=NULL, programado_at=NULL, cerrado_at=NULL WHERE id IN (SELECT request.id FROM solicitudes_abastecimiento request JOIN solicitudes_abastecimiento_detalle detail ON detail.solicitud_id=request.id JOIN presentaciones_producto presentation ON presentation.id=detail.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1) AND estado='PROGRAMADA'`, [`%${suffix}%`]);
    await db.query(`DELETE FROM consolidaciones_produccion WHERE id IN (SELECT detail.consolidacion_id FROM consolidaciones_detalle detail JOIN productos product ON product.id=detail.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM solicitudes_abastecimiento WHERE id IN (SELECT request.id FROM solicitudes_abastecimiento request JOIN solicitudes_abastecimiento_detalle detail ON detail.solicitud_id=request.id JOIN presentaciones_producto presentation ON presentation.id=detail.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    if (createdStockRequestIds.length) {
      await db.query(`DELETE FROM solicitudes_abastecimiento WHERE id = ANY($1::uuid[])`, [createdStockRequestIds]);
    }
    await db.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM productos WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM areas_produccion WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM lineas_productivas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM categorias_producto WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM unidades_medida WHERE abreviatura LIKE $1`, [`SA${suffix.slice(-4).toUpperCase()}%`]);
    await db.query(`DELETE FROM eventos_auditoria WHERE metadatos::text LIKE $1`, [`%${suffix}%`]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

const jar = new CookieJar();
try {
  await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier, password } }, 200, 'login');
  const category = await expectStatus('/api/categorias', { method: 'POST', jar, body: { name: `Categoría abastecimiento ${suffix}` } }, 201, 'categoría');
  const area = await expectStatus('/api/production-areas', { method: 'POST', jar, body: { name: `Área abastecimiento ${suffix}`, categoryIds: [category.id] } }, 201, 'área');
  const line = await expectStatus('/api/lineas-productivas', { method: 'POST', jar, body: { name: `Línea abastecimiento ${suffix}` } }, 201, 'línea');
  const unit = await expectStatus('/api/unidades', { method: 'POST', jar, body: { name: `Unidad abastecimiento ${suffix}`, abbreviation: `SA${suffix.slice(-4)}U`.toUpperCase(), decimalScale: 0 } }, 201, 'unidad');
  const product = await expectStatus('/api/productos', { method: 'POST', jar, body: { name: `Producto abastecimiento ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto');
  const presentation = await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar, body: { unitId: unit.id, description: 'Bolsa de prueba', conversionFactor: 1, weightKg: 1 } }, 201, 'presentación');
  const requiredDate = futureDate();

  let stockRequest = await expectStatus('/api/inventario/solicitudes-abastecimiento', { method: 'POST', jar, body: { requiredDate } }, 201, 'crear solicitud');
  createdStockRequestIds.push(stockRequest.id);
  assert.equal(stockRequest.status, 'BORRADOR');
  assert(Number.isInteger(stockRequest.code) && stockRequest.code > 0);
  let secondStockRequest = await expectStatus('/api/inventario/solicitudes-abastecimiento', { method: 'POST', jar, body: { requiredDate } }, 201, 'crear segunda solicitud para la misma fecha');
  createdStockRequestIds.push(secondStockRequest.id);
  assert.equal(secondStockRequest.status, 'BORRADOR');
  assert.notEqual(secondStockRequest.id, stockRequest.id);
  assert.equal(secondStockRequest.code, stockRequest.code + 1);
  process.stdout.write('✓ SA-01 crea solicitudes con código numérico correlativo y permite repetir la fecha requerida\n');

  const plan = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}/plan`, { jar }, 200, 'plan comercial');
  const candidate = plan.items.find((item) => item.presentation.id === presentation.id);
  assert(candidate);
  assert.equal(Number(candidate.physicalQuantity), 0);
  assert.equal(candidate.productionArea.id, area.id);
  process.stdout.write('✓ SA-02 presenta saldos calculados y el área derivada de la categoría\n');

  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 7, observation: 'Mantener stock mínimo' }] } }, 200, 'guardar solicitud');
  assert.equal(Number(stockRequest.details[0].additionalStockQuantity), 7);
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { method: 'PATCH', jar, body: { items: [] } }, 200, 'vaciar borrador');
  assert.equal(stockRequest.details.length, 0);
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 7, observation: 'Mantener stock mínimo' }] } }, 200, 'restaurar solicitud');
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}/enviar`, { method: 'POST', jar, body: {} }, 201, 'enviar solicitud');
  assert.equal(stockRequest.status, 'ENVIADA');
  secondStockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${secondStockRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 4, observation: 'Segunda solicitud de la misma fecha' }] } }, 200, 'guardar segunda solicitud');
  secondStockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${secondStockRequest.id}/enviar`, { method: 'POST', jar, body: {} }, 201, 'enviar segunda solicitud');
  assert.equal(secondStockRequest.status, 'ENVIADA');
  await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 8 }] } }, 409, 'bloqueo enviado');
  process.stdout.write('✓ SA-03 guarda, envía y bloquea las cantidades comerciales\n');

  await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: requiredDate } }, 422, 'selección obligatoria cuando hay varias solicitudes');
  let production = await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: requiredDate, stockRequestId: stockRequest.id } }, 201, 'generar producción desde primera solicitud');
  const detail = production.details.find((item) => item.presentationId === presentation.id);
  assert(detail);
  assert.equal(production.type, 'PRINCIPAL');
  assert.equal(Number(detail.productionRequiredQuantity), 0);
  assert.equal(Number(detail.stockRequestedQuantity), 7);
  assert.equal(Number(detail.additionalProductionQuantity), 0);
  assert.equal(Number(detail.plannedQuantity), 7);
  const secondProduction = await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: requiredDate, stockRequestId: secondStockRequest.id } }, 201, 'generar producción desde segunda solicitud');
  const secondDetail = secondProduction.details.find((item) => item.presentationId === presentation.id);
  assert(secondDetail);
  assert.equal(secondProduction.type, 'COMPLEMENTARIA');
  assert.equal(Number(secondDetail.stockRequestedQuantity), 4);
  assert.equal(Number(secondDetail.plannedQuantity), 4);
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { jar }, 200, 'solicitud programada');
  secondStockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${secondStockRequest.id}`, { jar }, 200, 'segunda solicitud programada');
  assert.equal(stockRequest.status, 'PROGRAMADA');
  assert.equal(stockRequest.productionConsolidationId, production.id);
  assert.equal(secondStockRequest.status, 'PROGRAMADA');
  assert.equal(secondStockRequest.productionConsolidationId, secondProduction.id);
  process.stdout.write('✓ SA-04 vincula cada solicitud de la misma fecha a su propia orden sin mezclar cantidades\n');

  production = await expectStatus(`/api/production-consolidations/${production.id}/details/${detail.id}/plan`, { method: 'PATCH', jar, body: { additionalQuantity: 3, reason: 'Completar batch de 10' } }, 200, 'ajuste técnico');
  const adjusted = production.details.find((item) => item.id === detail.id);
  assert.equal(Number(adjusted.stockRequestedQuantity), 7);
  assert.equal(Number(adjusted.additionalProductionQuantity), 3);
  assert.equal(Number(adjusted.plannedQuantity), 10);
  process.stdout.write('✓ SA-05 separa solicitud de stock y ajuste técnico por batch\n');
} finally {
  await cleanup();
}
