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
           UNION SELECT id::text FROM productos WHERE nombre = $2
           UNION SELECT id::text FROM categorias_producto WHERE nombre = $3
           UNION SELECT id::text FROM lineas_productivas WHERE nombre = $4
           UNION SELECT id::text FROM unidades_medida WHERE abreviatura = $5
           UNION SELECT id::text FROM clientes WHERE nombre_razon_social LIKE $6
           UNION SELECT id::text FROM usuarios WHERE email LIKE $7
         )
    `, [`%${suffix}%`, `Producto Aceptación ${suffix}`, `Categoría Aceptación ${suffix}`, `Línea Aceptación ${suffix}`, `U${suffix.slice(-5)}`.toUpperCase(), `%${suffix}%`, `%${suffix}@icar.local`]);
    await client.query(`DELETE FROM reservas_inventario WHERE detalle_pedido_id IN (SELECT d.id FROM pedidos_detalle d JOIN pedidos p ON p.id=d.pedido_id JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_estados_historial WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM notificaciones WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM actualizaciones_seguimiento WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM enlaces_seguimiento WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos_detalle WHERE pedido_id IN (SELECT p.id FROM pedidos p JOIN clientes c ON c.id=p.cliente_id WHERE c.nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM pedidos WHERE cliente_id IN (SELECT id FROM clientes WHERE nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM movimientos_inventario WHERE existencia_id IN (SELECT e.id FROM existencias e JOIN presentaciones_producto pp ON pp.id=e.presentacion_id JOIN productos p ON p.id=pp.producto_id WHERE p.nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM reservas_inventario WHERE existencia_id IN (SELECT e.id FROM existencias e JOIN presentaciones_producto pp ON pp.id=e.presentacion_id JOIN productos p ON p.id=pp.producto_id WHERE p.nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT pp.id FROM presentaciones_producto pp JOIN productos p ON p.id=pp.producto_id WHERE p.nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM precios_producto WHERE presentacion_id IN (SELECT pp.id FROM presentaciones_producto pp JOIN productos p ON p.id=pp.producto_id WHERE p.nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE $1)`, [`%${suffix}%`]);
    await client.query(`DELETE FROM productos WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await client.query(`DELETE FROM unidades_medida WHERE abreviatura=$1`, [`U${suffix.slice(-5)}`.toUpperCase()]);
    await client.query(`DELETE FROM lineas_productivas WHERE nombre=$1`, [`Línea Aceptación ${suffix}`]);
    await client.query(`DELETE FROM lineas_productivas WHERE nombre=$1`, [`Línea Alterna Aceptación ${suffix}`]);
    await client.query(`DELETE FROM lineas_productivas WHERE nombre=$1`, [`Línea Eliminable ${suffix}`]);
    await client.query(`DELETE FROM categorias_producto WHERE nombre=$1`, [`Categoría Aceptación ${suffix}`]);
    await client.query(`DELETE FROM categorias_producto WHERE nombre=$1`, [`Categoría Alterna Aceptación ${suffix}`]);
    await client.query(`DELETE FROM categorias_producto WHERE nombre=$1`, [`Categoría Eliminable ${suffix}`]);
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
  const secondDeliveryDate = isoDate(5);
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona Iteración 2 ${suffix}` } }, 201, 'zona')).payload;
  const day = (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(deliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'día')).payload;
  await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(secondDeliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'segundo día de reparto');
  const closedDeliveryDate = isoDate(0);
  const urgentZone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona Urgente ${suffix}` } }, 201, 'zona urgente')).payload;
  const urgentDay = (await expectStatus(`/api/zonas/${urgentZone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(closedDeliveryDate) } }, 201, 'día urgente')).payload;

  async function createCustomer(type, label, priceIndex) {
    const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type, businessName: `${label} ${suffix}`, taxId: `${label.slice(0, 3).toUpperCase()}-${suffix}-${priceIndex}`, phone: `70${priceIndex}00000`, email: `${label.toLowerCase()}.${suffix}@icar.local`, paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0 } }, 201, `cliente ${type}`)).payload;
    const address = (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección ${label}`, zoneId: zone.id, distributionDayId: day.id, isPrimary: true } }, 201, 'domicilio')).payload;
    const account = (await expectStatus(`/api/clientes/${customer.id}/usuarios`, { method: 'POST', jar: adminJar, body: { password: 'Cli12345' } }, 201, 'cuenta')).payload;
    const jar = new CookieJar();
    await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier: account.user.username, password: 'Cli12345' } }, 200, 'login cliente');
    return { customer, address, jar };
  }

  const publicCustomer = await createCustomer('PUBLICO', 'Publico', 0);
  const retail = await createCustomer('MINORISTA', 'Minorista', 1);
  const distributor = await createCustomer('DISTRIBUIDOR', 'Distribuidor', 2);
  const wholesale = await createCustomer('MAYORISTA', 'Mayorista', 3);
  const urgentAddress = (await expectStatus(`/api/clientes/${distributor.customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Urgente', address: 'Dirección urgente', zoneId: urgentZone.id, distributionDayId: urgentDay.id } }, 201, 'domicilio urgente')).payload;

  const scheduleSettings = (await expectStatus('/api/order-scheduling/settings', { jar: adminJar }, 200, 'configuración de programación')).payload;
  assert.match(scheduleSettings.orderCutoffTime.slice(0, 5), /^\d{2}:\d{2}$/);
  assert.match(scheduleSettings.consolidationDeadlineTime.slice(0, 5), /^\d{2}:\d{2}$/);
  assert(Number.isInteger(scheduleSettings.orderCutoffLeadDays));
  assert(Number.isInteger(scheduleSettings.preparationLeadDays));
  await expectStatus('/api/order-scheduling/settings', { method: 'PATCH', jar: commercialJar, body: {
    orderCutoffTime: scheduleSettings.orderCutoffTime.slice(0, 5),
    orderCutoffLeadDays: scheduleSettings.orderCutoffLeadDays,
    consolidationDeadlineTime: scheduleSettings.consolidationDeadlineTime.slice(0, 5),
    preparationLeadDays: scheduleSettings.preparationLeadDays,
  } }, 200, 'actualizar configuración de programación');
  await expectStatus('/api/order-scheduling/settings', { method: 'PATCH', jar: distributor.jar, body: {
    orderCutoffTime: '14:00', orderCutoffLeadDays: 1, consolidationDeadlineTime: '19:00', preparationLeadDays: 1,
  } }, 403, 'cliente no configura programación');
  passed('CP-36', 'los horarios de cierre y consolidación son configurables sólo por personal autorizado');

  await expectStatus(`/api/order-scheduling/delivery-options?addressId=${retail.address.id}`, { jar: commercialJar }, 400, 'personal sin cliente seleccionado');
  const deliveryOptions = (await expectStatus(`/api/order-scheduling/delivery-options?addressId=${distributor.address.id}`, { jar: distributor.jar }, 200, 'fechas de reparto de la zona')).payload;
  assert(deliveryOptions.some((option) => option.deliveryDate === deliveryDate));
  assert(deliveryOptions.some((option) => option.deliveryDate === secondDeliveryDate));
  assert(deliveryOptions.every((option) => new Date(option.orderCutoffAt).getTime() > Date.now()));
  await expectStatus(`/api/order-scheduling/delivery-options?addressId=${retail.address.id}`, { jar: distributor.jar }, 404, 'domicilio ajeno');
  passed('CP-37', 'el calendario ofrece todos los días activos de la zona, exige cliente al personal y respeta el alcance del cliente autenticado');

  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría Aceptación ${suffix}` } }, 201, 'categoría')).payload;
  const line = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea Aceptación ${suffix}` } }, 201, 'línea')).payload;
  const alternateCategory = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría Alterna Aceptación ${suffix}` } }, 201, 'categoría alterna')).payload;
  const disposableCategory = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría Eliminable ${suffix}` } }, 201, 'categoría eliminable')).payload;
  assert(Number.isInteger(category.code));
  assert(Number.isInteger(disposableCategory.code));
  const deletedCategory = (await expectStatus(`/api/categorias/${disposableCategory.id}`, { method: 'DELETE', jar: adminJar }, 200, 'eliminar categoría sin uso')).payload;
  assert.deepEqual(deletedCategory, { id: disposableCategory.id, deleted: true });
  const categoriesAfterDeletion = (await expectStatus('/api/categorias', { jar: adminJar }, 200, 'recargar categorías')).payload;
  assert(!categoriesAfterDeletion.some((item) => item.id === disposableCategory.id));
  const categoryCodes = categoriesAfterDeletion.map((item) => item.code);
  assert.deepEqual(categoryCodes, [...categoryCodes].sort((left, right) => left - right));
  const categoryDeletionAudit = (await expectStatus(`/api/auditoria?action=ELIMINAR_CATEGORIA&entityId=${disposableCategory.id}`, { jar: adminJar }, 200, 'auditoría de categoría eliminada')).payload;
  assert.equal(categoryDeletionAudit.data[0].metadata.name, disposableCategory.name);
  passed('CP-129', 'una categoría sin asignaciones se elimina y la acción queda auditada');
  passed('CP-131', 'las categorías tienen código numérico estable y se listan de menor a mayor');
  const alternateLine = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea Alterna Aceptación ${suffix}` } }, 201, 'línea alterna')).payload;
  const disposableLine = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea Eliminable ${suffix}` } }, 201, 'línea eliminable')).payload;
  assert(Number.isInteger(line.code));
  assert(Number.isInteger(disposableLine.code));
  const deletedLine = (await expectStatus(`/api/lineas-productivas/${disposableLine.id}`, { method: 'DELETE', jar: adminJar }, 200, 'eliminar línea sin uso')).payload;
  assert.deepEqual(deletedLine, { id: disposableLine.id, deleted: true });
  const linesAfterDeletion = (await expectStatus('/api/lineas-productivas', { jar: adminJar }, 200, 'recargar líneas')).payload;
  assert(!linesAfterDeletion.some((item) => item.id === disposableLine.id));
  const lineCodes = linesAfterDeletion.map((item) => item.code);
  assert.deepEqual(lineCodes, [...lineCodes].sort((left, right) => left - right));
  const lineDeletionAudit = (await expectStatus(`/api/auditoria?action=ELIMINAR_LINEA_PRODUCTIVA&entityId=${disposableLine.id}`, { jar: adminJar }, 200, 'auditoría de línea eliminada')).payload;
  assert.equal(lineDeletionAudit.data[0].metadata.name, disposableLine.name);
  passed('CP-126', 'una línea sin asignaciones se elimina y la acción queda auditada');
  passed('CP-128', 'las líneas tienen código numérico estable y se listan de menor a mayor');
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad Aceptación ${suffix}`, abbreviation: `U${suffix.slice(-5)}`, kilogramFactor: 1 } }, 201, 'unidad')).payload;
  const disposableUnit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad Eliminable ${suffix}`, abbreviation: `X${suffix.slice(-5)}`, kilogramFactor: 1 } }, 201, 'unidad eliminable')).payload;
  assert.equal(Number(unit.kilogramFactor), 1);
  await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad sin peso ${suffix}`, abbreviation: `S${suffix.slice(-5)}` } }, 400, 'unidad sin equivalencia en kg');
  passed('CP-154', 'una unidad nueva exige y conserva su equivalencia positiva en kilogramos');
  const deletedUnit = (await expectStatus(`/api/unidades/${disposableUnit.id}`, { method: 'DELETE', jar: adminJar }, 200, 'eliminar unidad sin uso')).payload;
  assert.deepEqual(deletedUnit, { id: disposableUnit.id, deleted: true });
  const unitsAfterDeletion = (await expectStatus('/api/unidades', { jar: adminJar }, 200, 'recargar unidades')).payload;
  assert(!unitsAfterDeletion.some((item) => item.id === disposableUnit.id));
  assert(Number.isInteger(unit.code));
  assert(Number.isInteger(disposableUnit.code));
  const unitCodes = unitsAfterDeletion.map((item) => item.code);
  assert.deepEqual(unitCodes, [...unitCodes].sort((left, right) => left - right));
  const deletionAudit = (await expectStatus(`/api/auditoria?action=ELIMINAR_UNIDAD&entityId=${disposableUnit.id}`, { jar: adminJar }, 200, 'auditoría de unidad eliminada')).payload;
  assert.equal(deletionAudit.data[0].metadata.abbreviation, disposableUnit.abbreviation);
  passed('CP-123', 'una unidad sin asignaciones se elimina y la acción queda auditada');
  passed('CP-125', 'las unidades tienen código numérico estable y se listan de menor a mayor');
  await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { code: `MANUAL-${suffix}`, name: `Código manual ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 400, 'impedir código manual');
  const disposableProduct = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { name: `Producto Eliminable ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto eliminable')).payload;
  assert(Number.isInteger(disposableProduct.code));
  const deletedProduct = (await expectStatus(`/api/productos/${disposableProduct.id}`, { method: 'DELETE', jar: adminJar }, 200, 'eliminar producto sin dependencias')).payload;
  assert.deepEqual(deletedProduct, { id: disposableProduct.id, deleted: true });
  const productsAfterDeletion = (await expectStatus('/api/productos?limit=100', { jar: adminJar }, 200, 'recargar productos')).payload;
  assert(!productsAfterDeletion.data.some((item) => item.id === disposableProduct.id));
  const productCodes = productsAfterDeletion.data.map((item) => item.code);
  assert(productCodes.every(Number.isInteger));
  assert.deepEqual(productCodes, [...productCodes].sort((left, right) => left - right));
  const productDeletionAudit = (await expectStatus(`/api/auditoria?action=ELIMINAR_PRODUCTO&entityId=${disposableProduct.id}`, { jar: adminJar }, 200, 'auditoría de producto eliminado')).payload;
  assert.equal(productDeletionAudit.data[0].metadata.code, disposableProduct.code);
  passed('CP-132', 'un producto sin presentaciones ni producción se elimina y la acción queda auditada');
  passed('CP-134', 'los productos reciben un código numérico automático, inmutable y se listan de menor a mayor');
  const product = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { name: `Producto Aceptación ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto')).payload;
  assert(Number.isInteger(product.code));
  await expectStatus(`/api/categorias/${category.id}`, { method: 'DELETE', jar: adminJar }, 409, 'impedir eliminación de categoría en uso');
  const categoriesAfterRejectedDeletion = (await expectStatus('/api/categorias', { jar: adminJar }, 200, 'recargar categoría en uso')).payload;
  assert(categoriesAfterRejectedDeletion.some((item) => item.id === category.id));
  passed('CP-130', 'una categoría asignada a un producto no puede eliminarse');
  await expectStatus(`/api/lineas-productivas/${line.id}`, { method: 'DELETE', jar: adminJar }, 409, 'impedir eliminación de línea en uso');
  const linesAfterRejectedDeletion = (await expectStatus('/api/lineas-productivas', { jar: adminJar }, 200, 'recargar línea en uso')).payload;
  assert(linesAfterRejectedDeletion.some((item) => item.id === line.id));
  passed('CP-127', 'una línea asignada a un producto no puede eliminarse');
  await expectStatus(`/api/unidades/${unit.id}`, { method: 'DELETE', jar: adminJar }, 409, 'impedir eliminación de unidad en uso');
  const unitsAfterRejectedDeletion = (await expectStatus('/api/unidades', { jar: adminJar }, 200, 'recargar unidad en uso')).payload;
  assert(unitsAfterRejectedDeletion.some((item) => item.id === unit.id));
  passed('CP-124', 'una unidad asignada a un producto no puede eliminarse');
  const updatedProduct = (await expectStatus(`/api/productos/${product.id}`, { method: 'PATCH', jar: adminJar, body: { categoryId: alternateCategory.id, productLineId: alternateLine.id } }, 200, 'editar categoría y línea del producto')).payload;
  assert.equal(updatedProduct.categoryId, alternateCategory.id);
  assert.equal(updatedProduct.category.id, alternateCategory.id);
  assert.equal(updatedProduct.productLineId, alternateLine.id);
  assert.equal(updatedProduct.productLine.id, alternateLine.id);
  const reloadedProduct = (await expectStatus(`/api/productos/${product.id}`, { jar: adminJar }, 200, 'recargar producto editado')).payload;
  assert.equal(reloadedProduct.categoryId, alternateCategory.id);
  assert.equal(reloadedProduct.category.id, alternateCategory.id);
  assert.equal(reloadedProduct.productLineId, alternateLine.id);
  assert.equal(reloadedProduct.productLine.id, alternateLine.id);
  assert.equal(reloadedProduct.imageUrl, null);
  passed('CP-135', 'un producto sin imagen se modifica correctamente y conserva disponible el reemplazo visual de ICAR');
  await expectStatus(`/api/productos/${product.id}`, { method: 'PATCH', jar: adminJar, body: { categoryId: category.id, productLineId: line.id } }, 200, 'restaurar categoría y línea del producto');
  passed('CAT-EDIT-01', 'la edición de un producto persiste la nueva categoría y línea al recargarlo');
  const basePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const imageBytes = Buffer.concat([basePng, Buffer.alloc(1_100_000)]);
  const imageDataUrl = `data:image/png;base64,${imageBytes.toString('base64')}`;
  await expectStatus(`/api/productos/${product.id}/imagen`, { method: 'PUT', jar: adminJar, body: { dataUrl: imageDataUrl } }, 200, 'imagen PNG de producto mayor a 1 MB');
  const presentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación principal', conversionFactor: 1, weightKg: 1 } }, 201, 'presentación')).payload;
  await expectStatus(`/api/productos/${product.id}`, { method: 'DELETE', jar: adminJar }, 409, 'impedir eliminación de producto con presentación');
  const productAfterRejectedDeletion = (await expectStatus(`/api/productos/${product.id}`, { jar: adminJar }, 200, 'recargar producto en uso')).payload;
  assert.equal(productAfterRejectedDeletion.id, product.id);
  passed('CP-133', 'un producto con presentaciones no puede eliminarse');
  const inactivePresentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación inactiva', conversionFactor: 2, weightKg: 2 } }, 201, 'presentación inactiva')).payload;
  const auxiliaryPresentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Presentación auxiliar', conversionFactor: 3, weightKg: 3 } }, 201, 'presentación auxiliar')).payload;
  await expectStatus(`/api/productos/${product.id}/presentaciones/${inactivePresentation.id}`, { method: 'PATCH', jar: adminJar, body: { status: 'INACTIVO' } }, 200, 'desactivar presentación');

  const amounts = { PUBLICO: 13, MINORISTA: 11, DISTRIBUIDOR: 9, MAYORISTA: 7 };
  const pricesByType = {};
  for (const [customerType, amount] of Object.entries(amounts)) {
    pricesByType[customerType] = (await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType, amount, validFrom: isoDate(-1) } }, 201, `precio ${customerType}`)).payload;
  }
  await expectStatus(`/api/presentaciones/${auxiliaryPresentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'DISTRIBUIDOR', amount: 5, validFrom: isoDate(-1) } }, 201, 'precio auxiliar');

  const initialMatrix = await expectStatus('/api/precios/matriz?limit=1000', { jar: adminJar }, 200, 'matriz de precios');
  const initialMatrixRow = initialMatrix.payload.data.find((item) => item.presentationId === presentation.id);
  assert(initialMatrixRow);
  assert.equal(initialMatrixRow.categoryId, category.id);
  assert.equal(initialMatrixRow.categoryName, category.name);
  assert.deepEqual(initialMatrixRow.prices, { PUBLICO: '13.00', MINORISTA: '11.00', DISTRIBUIDOR: '9.00', MAYORISTA: '7.00' });
  const bulkResult = await expectStatus('/api/precios/actualizacion-masiva', { method: 'PUT', jar: adminJar, body: { items: [
    { presentationId: presentation.id, customerType: 'PUBLICO', amount: 13.25 },
    { presentationId: presentation.id, customerType: 'MINORISTA', amount: 12.34 },
  ] } }, 200, 'actualización masiva de precios');
  assert.equal(bulkResult.payload.updated, 2);
  const updatedMatrix = await expectStatus('/api/precios/matriz?limit=1000', { jar: adminJar }, 200, 'recargar matriz de precios');
  const updatedMatrixRow = updatedMatrix.payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(updatedMatrixRow.prices.PUBLICO, '13.25');
  assert.equal(updatedMatrixRow.prices.MINORISTA, '12.34');
  assert(updatedMatrixRow.lastModifiedAt);
  await expectStatus('/api/precios/actualizacion-masiva', { method: 'PUT', jar: adminJar, body: { items: [
    { presentationId: presentation.id, customerType: 'PUBLICO', amount: 13 },
    { presentationId: presentation.id, customerType: 'MINORISTA', amount: 11 },
  ] } }, 200, 'restaurar precios desde matriz');
  passed('PRICE-MATRIX-01', 'la matriz presenta los cuatro tipos y aplica todos los cambios sólo mediante la actualización masiva');

  const updatedRetailPrice = (await expectStatus(`/api/precios/${pricesByType.MINORISTA.id}`, { method: 'PATCH', jar: adminJar, body: { amount: 12.34 } }, 200, 'editar precio')).payload;
  assert.equal(updatedRetailPrice.amount, '12.34');
  const priceListAfterEdit = await expectStatus(`/api/precios?limit=100&presentationId=${presentation.id}`, { jar: adminJar }, 200, 'recargar precio editado');
  assert.equal(priceListAfterEdit.payload.data.find((item) => item.id === pricesByType.MINORISTA.id).amount, '12.34');
  const retailCatalogAfterPriceEdit = await expectStatus('/api/catalogo?limit=100', { jar: retail.jar }, 200, 'recargar catálogo después de editar precio');
  assert.equal(retailCatalogAfterPriceEdit.payload.data.find((item) => item.id === product.id).presentations.find((item) => item.id === presentation.id).price.amount, '12.34');
  await expectStatus(`/api/precios/${pricesByType.MINORISTA.id}`, { method: 'PATCH', jar: adminJar, body: { amount: 11 } }, 200, 'restaurar precio');
  passed('PRICE-EDIT-01', 'la edición de precio persiste y se refleja en la lista y el catálogo al recargarlos');

  const retailCatalog = await expectStatus('/api/catalogo?limit=100', { jar: retail.jar }, 200, 'CP-13');
  const catalogProduct = retailCatalog.payload.data.find((item) => item.id === product.id);
  assert(catalogProduct);
  assert.match(catalogProduct.imageUrl, new RegExp(`/api/catalogo/productos/${product.id}/imagen`));
  const productImage = await expectStatus(catalogProduct.imageUrl, { jar: retail.jar }, 200, 'imagen visible en catálogo');
  assert.equal(productImage.response.headers.get('content-type'), 'image/png');
  assert.equal(Number(productImage.response.headers.get('content-length')), imageBytes.length);
  passed('IMG-01', 'una imagen PNG mayor a 1 MB se guarda en PostgreSQL y el cliente autenticado puede verla en el catálogo');
  assert.equal(catalogProduct.presentations.find((item) => item.id === presentation.id).price.amount, '11.00');
  passed('CP-13', 'el catálogo del cliente muestra solo información activa con su precio aplicable');
  assert(!catalogProduct.presentations.some((item) => item.id === inactivePresentation.id));
  passed('CP-14', 'una presentación inactiva desaparece del catálogo sin eliminarse');

  for (const [context, expected] of [[publicCustomer, '13.00'], [retail, '11.00'], [distributor, '9.00'], [wholesale, '7.00']]) {
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
  assert(draft.createdAt);
  assert(draft.orderCutoffAt);
  assert(draft.preparationAt);
  const boliviaHour = (value) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/La_Paz', hour: '2-digit', hour12: false }).format(new Date(value));
  assert.equal(boliviaHour(draft.orderCutoffAt), scheduleSettings.orderCutoffTime.slice(0, 2));
  assert.equal(boliviaHour(draft.preparationAt), scheduleSettings.consolidationDeadlineTime.slice(0, 2));
  passed('CP-38', 'el pedido conserva fecha de registro, cierre, preparación y entrega como hitos diferenciados');
  passed('CP-17', 'el cliente crea y consulta un Borrador propio con su detalle');
  await expectStatus(`/api/pedidos/${draft.id}`, { jar: retail.jar }, 404, 'CP-18');
  const rejectedAudit = await expectStatus(`/api/auditoria?action=ACCESO_PEDIDO_AJENO&entityId=${draft.id}`, { jar: adminJar }, 200, 'auditoría CP-18');
  assert(rejectedAudit.payload.data.length >= 1);
  passed('CP-18', 'un cliente no accede a pedidos ajenos y el rechazo queda auditado');

  const staffDraft = await expectStatus('/api/pedidos', { method: 'POST', jar: commercialJar, body: { customerId: retail.customer.id, addressId: retail.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 201, 'CP-19');
  assert.equal(staffDraft.payload.createdBy.id, commercialUser.id);
  passed('CP-19', 'el personal comercial registra un pedido para un cliente autorizado');
  await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: urgentAddress.id, requestedDate: closedDeliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 422, 'CP-20');
  passed('CP-20', 'se rechaza una entrega cuyo cierre configurable ya finalizó');
  await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: isoDate(4), details: [{ presentationId: presentation.id, quantity: 1 }] } }, 422, 'CP-21');
  passed('CP-21', 'se rechaza una fecha incompatible con el día del domicilio');

  await expectStatus(`/api/pedidos/${draft.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'CP-22');
  const editedReceived = (await expectStatus(`/api/pedidos/${draft.id}`, { method: 'PATCH', jar: distributor.jar, body: { observations: 'Modificado por el cliente antes del cierre', details: [{ presentationId: presentation.id, quantity: 6 }] } }, 200, 'editar recibido antes del cierre')).payload;
  assert.equal(editedReceived.status, 'RECIBIDO');
  assert.equal(editedReceived.details[0].requestedQuantity, '6.000');
  passed('CP-39', 'el cliente puede agregar o modificar cantidades en un pedido Recibido mientras el cierre siga abierto');
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
  assert.equal(adjustment.payload.previousBalance, '20.000000');
  assert.equal(adjustment.payload.newBalance, '25.000000');
  passed('CP-29', 'ingresos y ajustes conservan saldos, motivo, usuario y fecha');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_NEGATIVO', quantity: 999, reason: 'Movimiento inválido' } }, 422, 'CP-30');
  passed('CP-30', 'un ajuste que dejaría saldo negativo se rechaza sin alterar el inventario');

  await expectStatus(`/api/pedidos/${draft.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'reenviar');
  const confirmed = await expectStatus(`/api/pedidos/${draft.id}/confirmar`, { method: 'POST', jar: commercialJar, body: { observation: 'Confirmación completa' } }, 201, 'CP-25');
  assert.equal(confirmed.payload.status, 'CONFIRMADO');
  assert.equal(confirmed.payload.details[0].reservedQuantity, '6.000');
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
  assert.equal(partial.payload.details[0].reservedQuantity, '19.000');
  assert.equal(partial.payload.details[0].pendingQuantity, '11.000');
  const partialReservation = await expectStatus(`/api/inventario/reservas?limit=100&orderId=${partialDraft.id}`, { jar: adminJar }, 200, 'reserva completa del pedido parcial');
  assert.equal(partialReservation.payload.data[0].quantity, '30.000');
  const stockAfterPartial = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia negativa del pedido parcial')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(stockAfterPartial.reservedQuantity, '36.000000');
  assert.equal(stockAfterPartial.availableQuantity, '-11.000');
  passed('CP-26', 'el pedido compromete toda la cantidad, conserva la cobertura física y muestra el déficit negativo');

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
  const pendingConcurrent = Number(confirmationA.payload.details[0].pendingQuantity) + Number(confirmationB.payload.details[0].pendingQuantity);
  assert.equal(reservedConcurrent, 0);
  assert.equal(pendingConcurrent, 20);
  passed('CP-27', 'confirmaciones simultáneas comprometen todos los pedidos y calculan la cobertura física sin colisiones');

  const stocks = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'CP-31');
  const mainStock = stocks.payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(Number(mainStock.availableQuantity), Number(mainStock.physicalQuantity) - Number(mainStock.reservedQuantity));
  assert.equal(mainStock.availableQuantity, '-21.000');
  assert.equal(mainStock.shortageQuantity, '21.000');
  const stockFilterOptions = await expectStatus('/api/inventario/filtros-existencias', { jar: adminJar }, 200, 'alerta de disponibilidad negativa');
  assert(Number(stockFilterOptions.payload.negativeCount) >= 1);
  passed('CP-31', 'el disponible negativo equivale al físico menos todo lo reservado y activa la alerta de abastecimiento');

  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: auxiliaryPresentation.id, type: 'INGRESO', quantity: 1, reason: 'Alta temporal para validar Almacén' } }, 201, 'alta temporal de existencia auxiliar');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: auxiliaryPresentation.id, type: 'AJUSTE_NEGATIVO', quantity: 1, reason: 'Saldo cero para validar filtro de Almacén' } }, 201, 'saldo auxiliar en cero');
  const warehouseStocks = await expectStatus(`/api/inventario/existencias?limit=100&onlyWithStock=true&productId=${product.id}`, { jar: adminJar }, 200, 'CP-121 tabla de Almacén');
  assert(warehouseStocks.payload.data.every((item) => Number(item.physicalQuantity) > 0));
  assert(!warehouseStocks.payload.data.some((item) => item.presentationId === auxiliaryPresentation.id));
  const visibleWarehouseStock = warehouseStocks.payload.data.find((item) => item.presentationId === presentation.id);
  assert(visibleWarehouseStock);
  assert.equal(visibleWarehouseStock.presentation.product.category.id, category.id);
  assert.equal(visibleWarehouseStock.presentation.product.productLine.id, line.id);
  const warehouseFilters = await expectStatus('/api/inventario/filtros-existencias', { jar: adminJar }, 200, 'filtros de Almacén');
  assert(warehouseFilters.payload.categories.some((item) => item.id === category.id));
  assert(warehouseFilters.payload.productLines.some((item) => item.id === line.id));
  const filteredWarehouseStocks = await expectStatus(`/api/inventario/existencias?limit=100&onlyWithStock=true&categoryId=${category.id}&productLineId=${line.id}`, { jar: adminJar }, 200, 'filtrar Almacén');
  assert(filteredWarehouseStocks.payload.data.some((item) => item.presentationId === presentation.id));
  const orderedWarehouseStocks = await expectStatus('/api/inventario/existencias?limit=100&onlyWithStock=true', { jar: adminJar }, 200, 'ordenar existencias por código');
  const warehouseCodes = orderedWarehouseStocks.payload.data.map((item) => Number(item.presentation.product.code));
  assert(warehouseCodes.every((code, index) => index === 0 || warehouseCodes[index - 1] <= code));
  const wrongCategoryStocks = await expectStatus(`/api/inventario/existencias?limit=100&onlyWithStock=true&productId=${product.id}&categoryId=${alternateCategory.id}`, { jar: adminJar }, 200, 'filtro de categoría incompatible');
  assert.equal(wrongCategoryStocks.payload.meta.total, 0);
  passed('CP-121', 'Almacén ordena por código ascendente y permite combinar búsqueda, categoría y línea');

  const cancelDraft = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 201, 'pedido borrador para cancelar')).payload;
  await expectStatus(`/api/pedidos/${cancelDraft.id}/cancelar`, { method: 'POST', jar: distributor.jar, body: { reason: 'x' } }, 400, 'CP-33 motivo obligatorio');
  const canceledDraft = (await expectStatus(`/api/pedidos/${cancelDraft.id}/cancelar`, { method: 'POST', jar: distributor.jar, body: { reason: 'El cliente desistió del pedido' } }, 201, 'CP-33 cancelar borrador')).payload;
  assert.equal(canceledDraft.status, 'CANCELADO');
  assert.equal(canceledDraft.cancellationReason, 'El cliente desistió del pedido');
  assert.equal(canceledDraft.canceledBy.id, canceledDraft.createdBy.id);
  assert(canceledDraft.canceledAt);
  await expectStatus(`/api/pedidos/${cancelDraft.id}/cancelar`, { method: 'POST', jar: distributor.jar, body: { reason: 'Segundo intento' } }, 409, 'CP-33 segunda cancelación');
  passed('CP-33', 'un Borrador se cancela sin eliminarse, conserva el motivo y no admite otra cancelación');

  const cancelReceived = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 201, 'pedido recibido para cancelar')).payload;
  await expectStatus(`/api/pedidos/${cancelReceived.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'enviar pedido a cancelar');
  const canceledReceived = (await expectStatus(`/api/pedidos/${cancelReceived.id}/cancelar`, { method: 'POST', jar: distributor.jar, body: { reason: 'Cambio de necesidad del cliente' } }, 201, 'CP-34 cancelar recibido')).payload;
  assert.equal(canceledReceived.status, 'CANCELADO');
  const receivedHistory = await expectStatus(`/api/pedidos/${cancelReceived.id}/historial`, { jar: distributor.jar }, 200, 'historial de recibido cancelado');
  assert.deepEqual(receivedHistory.payload.map((item) => item.newStatus), ['BORRADOR', 'RECIBIDO', 'CANCELADO']);
  passed('CP-34', 'el cliente cancela su pedido Recibido y la transición queda en el historial');

  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'AJUSTE_POSITIVO', quantity: 4, reason: 'Saldo para probar cancelación' } }, 201, 'saldo cancelación confirmada');
  const cancelConfirmed = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 4 }] } }, 201, 'pedido confirmado para cancelar')).payload;
  await expectStatus(`/api/pedidos/${cancelConfirmed.id}/enviar`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'enviar confirmado a cancelar');
  const stockBeforeCancelConfirmation = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia antes de confirmar cancelación')).payload.data.find((item) => item.presentationId === presentation.id);
  await expectStatus(`/api/pedidos/${cancelConfirmed.id}/confirmar`, { method: 'POST', jar: commercialJar, body: {} }, 201, 'confirmar pedido a cancelar');
  const stockWithCancellationReservation = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia reservada para cancelar')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(Number(stockWithCancellationReservation.reservedQuantity), Number(stockBeforeCancelConfirmation.reservedQuantity) + 4);
  assert.equal(stockWithCancellationReservation.physicalQuantity, stockBeforeCancelConfirmation.physicalQuantity);
  const canceledConfirmed = (await expectStatus(`/api/pedidos/${cancelConfirmed.id}/cancelar`, { method: 'POST', jar: commercialJar, body: { reason: 'Cancelación solicitada antes de preparación' } }, 201, 'CP-35 cancelar confirmado')).payload;
  assert.equal(canceledConfirmed.status, 'CANCELADO');
  assert.equal(canceledConfirmed.details[0].reservedQuantity, '0.000');
  const stockAfterConfirmedCancellation = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia después de cancelar')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(stockAfterConfirmedCancellation.physicalQuantity, stockWithCancellationReservation.physicalQuantity);
  assert.equal(Number(stockAfterConfirmedCancellation.reservedQuantity), Number(stockWithCancellationReservation.reservedQuantity) - 4);
  assert.equal(Number(stockAfterConfirmedCancellation.availableQuantity), Number(stockWithCancellationReservation.availableQuantity) + 4);
  const releasedReservations = await expectStatus('/api/inventario/reservas?limit=100&status=LIBERADA', { jar: adminJar }, 200, 'reserva liberada');
  assert(releasedReservations.payload.data.some((item) => item.orderDetail.order?.id === cancelConfirmed.id));
  const cancellationAudit = await expectStatus(`/api/auditoria?action=CANCELAR_PEDIDO&entityId=${cancelConfirmed.id}`, { jar: adminJar }, 200, 'auditoría de cancelación');
  assert.equal(cancellationAudit.payload.data[0].metadata.releasedQuantity, '4.000');
  passed('CP-35', 'cancelar un Confirmado libera la reserva, aumenta el disponible y no modifica la cantidad física');

  const closedOrder = (await expectStatus('/api/pedidos', { method: 'POST', jar: distributor.jar, body: { addressId: distributor.address.id, requestedDate: secondDeliveryDate, details: [{ presentationId: presentation.id, quantity: 1 }] } }, 201, 'pedido para simular cierre')).payload;
  const closureDb = await databaseClient();
  try { await closureDb.query(`UPDATE pedidos SET fecha_cierre_pedido=now() - interval '1 minute' WHERE id=$1`, [closedOrder.id]); }
  finally { await closureDb.end(); }
  await expectStatus(`/api/pedidos/${closedOrder.id}`, { method: 'PATCH', jar: distributor.jar, body: { observations: 'Intento fuera de plazo' } }, 422, 'editar después del cierre');
  const rescheduledClosedOrder = (await expectStatus(`/api/pedidos/${closedOrder.id}/reprogramar-siguiente-fecha`, { method: 'POST', jar: distributor.jar, body: {} }, 201, 'reprogramar después del cierre')).payload;
  assert(rescheduledClosedOrder.requestedDate > secondDeliveryDate);
  assert(new Date(rescheduledClosedOrder.orderCutoffAt).getTime() > Date.now());
  assert.equal(rescheduledClosedOrder.status, 'BORRADOR');
  const rescheduledHistory = await expectStatus(`/api/pedidos/${closedOrder.id}/historial`, { jar: distributor.jar }, 200, 'historial de reprogramación');
  assert(rescheduledHistory.payload.some((item) => item.previousStatus === 'BORRADOR' && item.newStatus === 'BORRADOR' && item.observation.includes('reprogramado')));
  const reschedulingAudit = await expectStatus(`/api/auditoria?action=REPROGRAMAR_PEDIDO_SIGUIENTE_FECHA&entityId=${closedOrder.id}`, { jar: adminJar }, 200, 'auditoría de reprogramación');
  assert.equal(reschedulingAudit.payload.data[0].metadata.previousRequestedDate, secondDeliveryDate);
  const secondClosureDb = await databaseClient();
  try { await secondClosureDb.query(`UPDATE pedidos SET fecha_cierre_pedido=now() - interval '1 minute' WHERE id=$1`, [closedOrder.id]); }
  finally { await secondClosureDb.end(); }
  const canceledAfterClosure = (await expectStatus(`/api/pedidos/${closedOrder.id}/cancelar`, { method: 'POST', jar: distributor.jar, body: { reason: 'Cancelación elegida después del cierre' } }, 201, 'cancelar después del cierre')).payload;
  assert.equal(canceledAfterClosure.status, 'CANCELADO');
  passed('CP-40', 'al vencer el cierre se bloquea la edición y se permite reprogramar a la siguiente fecha o cancelar');

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
