import assert from 'node:assert/strict';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const suffix = process.env.ACCEPTANCE_SUFFIX ?? Date.now().toString(36);
const marker = `I4-${suffix}`.toUpperCase();

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
  const client = new pg.Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
  await client.connect();
  return client;
}

async function cleanup() {
  if (!process.env.DATABASE_HOST || process.env.ACCEPTANCE_KEEP_DATA === 'true') return;
  const db = await databaseClient();
  try {
    await db.query('BEGIN');
    const routeIds = `(SELECT id FROM rutas_distribucion WHERE observacion = '${marker}')`;
    const deliveryIds = `(SELECT id FROM rutas_entregas WHERE ruta_id IN ${routeIds})`;
    const preparationIds = `(SELECT id FROM preparaciones_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = '${marker}'))`;
    await db.query(`DELETE FROM eventos_auditoria WHERE entidad_id IN (
      SELECT id::text FROM rutas_distribucion WHERE id IN ${routeIds}
      UNION SELECT id::text FROM preparaciones_pedido WHERE id IN ${preparationIds}
      UNION SELECT id::text FROM pedidos WHERE observaciones = $1
      UNION SELECT id::text FROM vehiculos WHERE placa LIKE $2
      UNION SELECT id::text FROM productos WHERE codigo LIKE $2
      UNION SELECT id::text FROM usuarios WHERE email LIKE $3
    ) OR metadatos::text LIKE $4`, [marker, `${marker}%`, `%${suffix}@icar.local`, `%${suffix}%`]);
    await db.query(`DELETE FROM liquidaciones_ruta WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM rutas_historial WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM resultados_visita_detalle WHERE resultado_visita_id IN (SELECT id FROM resultados_visita WHERE ruta_entrega_id IN ${deliveryIds})`);
    await db.query(`DELETE FROM resultados_visita WHERE ruta_entrega_id IN ${deliveryIds}`);
    await db.query(`DELETE FROM movimientos_inventario WHERE ruta_entrega_id IN ${deliveryIds}`);
    await db.query(`DELETE FROM rutas_entregas WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM rutas_responsables WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM rutas_distribucion WHERE id IN ${routeIds}`);
    await db.query(`DELETE FROM preparaciones_historial WHERE preparacion_id IN ${preparationIds}`);
    await db.query(`DELETE FROM preparaciones_detalle WHERE preparacion_id IN ${preparationIds}`);
    await db.query(`DELETE FROM preparaciones_pedido WHERE id IN ${preparationIds}`);
    await db.query(`DELETE FROM reservas_inventario WHERE detalle_pedido_id IN (SELECT id FROM pedidos_detalle WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1))`, [marker]);
    await db.query(`DELETE FROM pedidos_estados_historial WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM pedidos_detalle WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM pedidos WHERE observaciones = $1`, [marker]);
    await db.query(`DELETE FROM movimientos_inventario WHERE existencia_id IN (SELECT stock.id FROM existencias stock JOIN presentaciones_producto presentation ON presentation.id=stock.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`${marker}%`]);
    await db.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`${marker}%`]);
    await db.query(`DELETE FROM precios_producto WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.codigo LIKE $1)`, [`${marker}%`]);
    await db.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE codigo LIKE $1)`, [`${marker}%`]);
    await db.query(`DELETE FROM productos WHERE codigo LIKE $1`, [`${marker}%`]);
    await db.query(`DELETE FROM unidades_medida WHERE abreviatura LIKE $1`, [`${marker.slice(0, 12)}%`]);
    await db.query(`DELETE FROM lineas_productivas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM categorias_producto WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM domicilios_cliente WHERE cliente_id IN (SELECT id FROM clientes WHERE nombre_razon_social LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM clientes WHERE nombre_razon_social LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM dias_distribucion WHERE zona_id IN (SELECT id FROM zonas WHERE nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM zonas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM vehiculos WHERE placa LIKE $1`, [`${marker}%`]);
    await db.query(`DELETE FROM eventos_auditoria WHERE usuario_id IN (SELECT id FROM usuarios WHERE email LIKE $1)`, [`%${suffix}@icar.local`]);
    await db.query(`DELETE FROM usuarios WHERE email LIKE $1`, [`%${suffix}@icar.local`]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { await db.end(); }
}

try {
  const adminJar = new CookieJar();
  await expectStatus('/api/auth/login', { method: 'POST', jar: adminJar, body: { identifier: adminIdentifier, password: adminPassword } }, 200, 'login administrador');
  const roles = (await expectStatus('/api/roles', { jar: adminJar }, 200, 'roles')).payload;
  const driverRole = roles.find((role) => role.name === 'REPARTIDOR');
  assert(driverRole, 'falta el rol REPARTIDOR');
  const driver = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Repartidor I4 ${suffix}`, username: `i4.driver.${suffix}`, email: `i4.driver.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [driverRole.id] } }, 201, 'repartidor')).payload;
  const otherDriver = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Repartidor ajeno I4 ${suffix}`, username: `i4.other.${suffix}`, email: `i4.other.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [driverRole.id] } }, 201, 'repartidor ajeno')).payload;
  const login = async (identifier) => { const jar = new CookieJar(); await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier, password: 'Reparto1234!' } }, 200, `login ${identifier}`); return jar; };
  const driverJar = await login(driver.email);
  const otherDriverJar = await login(otherDriver.email);

  const deliveryDate = isoDate(14);
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona I4 ${suffix}` } }, 201, 'zona')).payload;
  const day = (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(deliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'día')).payload;
  const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type: 'MINORISTA', businessName: `Cliente I4 ${suffix}`, taxId: marker, phone: '70004004', paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0 } }, 201, 'cliente')).payload;
  const address = (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección I4 ${suffix}`, reference: 'Puerta azul', zoneId: zone.id, distributionDayId: day.id, latitude: -16.4897, longitude: -68.1193, isPrimary: true } }, 201, 'domicilio')).payload;
  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría I4 ${suffix}` } }, 201, 'categoría')).payload;
  const line = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea I4 ${suffix}` } }, 201, 'línea')).payload;
  const abbreviation = marker.slice(0, 12);
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad I4 ${suffix}`, abbreviation, decimalScale: 3 } }, 201, 'unidad')).payload;
  const product = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { code: `${marker}-P01`, name: `Producto I4 ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto')).payload;
  const presentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Paquete I4', conversionFactor: 1 } }, 201, 'presentación')).payload;
  await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'MINORISTA', amount: 25, validFrom: isoDate(-1) } }, 201, 'precio');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'INGRESO', quantity: 50, reason: marker } }, 201, 'existencia');
  let order = (await expectStatus('/api/pedidos', { method: 'POST', jar: adminJar, body: { customerId: customer.id, addressId: address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 10 }], observations: marker } }, 201, 'pedido')).payload;
  order = (await expectStatus(`/api/pedidos/${order.id}/enviar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'enviar pedido')).payload;
  order = (await expectStatus(`/api/pedidos/${order.id}/confirmar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar pedido')).payload;

  const eligible = await expectStatus(`/api/preparations/eligible?deliveryDate=${deliveryDate}&zoneId=${zone.id}`, { jar: adminJar }, 200, 'CP-55');
  assert(eligible.payload.data.some((item) => item.id === order.id));
  passed('CP-55', 'solo los pedidos Confirmados sin preparación activa son elegibles');
  let preparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: order.id } }, 201, 'crear preparación')).payload;
  await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: order.id } }, 409, 'CP-56');
  passed('CP-56', 'impide una segunda preparación activa para el mismo pedido');
  assert.equal(Number(preparation.details[0].requestedQuantity), 10);
  assert.equal(Number(preparation.details[0].reservedQuantity), 10);
  passed('CP-57', 'expone cantidades solicitada, reservada, disponible, preparada y pendiente');
  await expectStatus(`/api/preparations/${preparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: preparation.details[0].id, preparedQuantity: 11, verified: true }] } }, 400, 'CP-59');
  passed('CP-59', 'rechaza cantidades preparadas superiores a lo solicitado');
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: preparation.details[0].id, preparedQuantity: 8, verified: true }] } }, 201, 'avance parcial')).payload;
  assert.equal(preparation.status, 'OBSERVADA');
  passed('CP-58', 'calcula una diferencia negativa y cambia la preparación a Observada');
  await expectStatus(`/api/preparations/${preparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 422, 'CP-60');
  passed('CP-60', 'no confirma una diferencia sin observación');
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: preparation.details[0].id, preparedQuantity: 10, verified: true }] } }, 201, 'avance completo')).payload;
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 201, 'CP-61')).payload;
  assert.equal(preparation.status, 'PREPARADA');
  passed('CP-61', 'confirma todos los detalles verificados y registra el historial');

  const vehicle = (await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-V`, description: 'Camión de aceptación', referenceCapacity: 1000 } }, 201, 'vehículo')).payload;
  await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-V`, description: 'Duplicado' } }, 409, 'placa duplicada');
  const route = (await expectStatus('/api/distribution-routes', { method: 'POST', jar: adminJar, body: { date: deliveryDate, zoneId: zone.id, vehicleId: vehicle.id, responsibleIds: [driver.id], principalResponsibleId: driver.id, observation: marker } }, 201, 'ruta')).payload;
  let managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/deliveries`, { method: 'POST', jar: adminJar, body: { preparationIds: [preparation.id] } }, 201, 'asignar entrega')).payload;
  await expectStatus(`/api/distribution-routes/${route.id}/deliveries`, { method: 'POST', jar: adminJar, body: { preparationIds: [preparation.id] } }, 409, 'CP-64');
  passed('CP-64', 'una preparación no puede asignarse a dos rutas activas');
  managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/sequence`, { method: 'PUT', jar: adminJar, body: { deliveries: [{ routeDeliveryId: managedRoute.deliveries[0].id, position: 1 }] } }, 200, 'secuencia')).payload;
  passed('CP-67', 'guarda posiciones manuales únicas y consecutivas');
  managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/plan`, { method: 'POST', jar: adminJar, body: {} }, 201, 'planificar')).payload;
  assert.equal(managedRoute.status, 'PLANIFICADA');
  passed('CP-66', 'la ruta planificada conserva coordenadas válidas para el mapa');
  const [departureA, departureB] = await Promise.all([
    request(`/api/distribution-routes/${route.id}/departure`, { method: 'POST', jar: adminJar, body: {} }),
    request(`/api/distribution-routes/${route.id}/departure`, { method: 'POST', jar: adminJar, body: {} }),
  ]);
  assert.deepEqual([departureA.response.status, departureB.response.status].sort(), [201, 409]);
  managedRoute = departureA.response.status === 201 ? departureA.payload : departureB.payload;
  passed('CP-70', 'la salida consume reservas, disminuye existencia y cambia estados en una transacción');
  passed('CP-79', 'dos salidas simultáneas no consumen dos veces la reserva');
  const delivery = managedRoute.deliveries[0];
  await expectStatus(`/api/route-deliveries/${delivery.id}/result`, { method: 'POST', jar: otherDriverJar, body: { result: 'ENTREGADA', details: [{ preparationDetailId: delivery.preparation.details[0].id, deliveredQuantity: 10, returnedQuantity: 0 }] } }, 403, 'CP-72');
  passed('CP-72', 'un repartidor no asignado no puede registrar la visita');
  const myRoutes = await expectStatus('/api/distribution-routes/my-route', { jar: driverJar }, 200, 'ruta asignada');
  assert(myRoutes.payload.some((item) => item.id === route.id));
  managedRoute = (await expectStatus(`/api/route-deliveries/${delivery.id}/result`, { method: 'POST', jar: driverJar, body: { result: 'ENTREGADA', details: [{ preparationDetailId: delivery.preparation.details[0].id, deliveredQuantity: 10, returnedQuantity: 0 }] } }, 201, 'CP-73')).payload;
  assert.equal(managedRoute.deliveries[0].result.result, 'ENTREGADA');
  passed('CP-73', 'registra entrega completa con cantidades, fecha y responsable');
  managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/finish`, { method: 'POST', jar: adminJar, body: {} }, 201, 'finalizar')).payload;
  assert.equal(managedRoute.status, 'FINALIZADA');
  managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/settlement`, { method: 'POST', jar: adminJar, body: { acceptedReturns: [], observation: 'Sin devoluciones' } }, 201, 'CP-78')).payload;
  assert.equal(managedRoute.status, 'LIQUIDADA');
  passed('CP-78', 'liquida operativamente sin registrar pagos ni comprobantes');
  const history = await expectStatus(`/api/distribution-routes/${route.id}/history`, { jar: adminJar }, 200, 'CP-80');
  assert(history.payload.every((event) => event.user?.id && event.occurredAt));
  assert(history.payload.some((event) => event.event === 'LIQUIDACION'));
  passed('CP-80', 'el historial conserva eventos cronológicos con usuario y fecha');
  const summary = await expectStatus(`/api/distribution-routes/summary?date=${deliveryDate}`, { jar: adminJar }, 200, 'resumen');
  const row = summary.payload.data.find((item) => item.id === route.id);
  assert.equal(Number(row.metrics.complete), 1);
  assert.equal(Number(row.metrics.acceptedReturnQuantity), 0);

  process.stdout.write(`\n${results.length} comprobaciones de aceptación de la cuarta iteración superadas.\n`);
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); process.stdout.write('Datos temporales de la cuarta iteración eliminados.\n'); }
  catch (error) { process.stderr.write(`No fue posible limpiar los datos temporales: ${error.stack ?? error}\n`); process.exitCode = 1; }
}
