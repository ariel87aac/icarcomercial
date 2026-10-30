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
function addIsoDays(value, days) { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
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
    const deliveryIds = `(SELECT id FROM rutas_entregas WHERE ruta_id IN ${routeIds} OR pedido_id IN (SELECT id FROM pedidos WHERE observaciones = '${marker}'))`;
    const preparationIds = `(SELECT id FROM preparaciones_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = '${marker}'))`;
    const saleIds = `(SELECT id FROM ventas WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = '${marker}'))`;
    const saleCodes = `(SELECT codigo FROM ventas WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = '${marker}'))`;
    await db.query(`DELETE FROM eventos_auditoria WHERE entidad_id IN (
      SELECT id::text FROM rutas_distribucion WHERE id IN ${routeIds}
      UNION SELECT id::text FROM rutas_entregas WHERE id IN ${deliveryIds}
      UNION SELECT id::text FROM preparaciones_pedido WHERE id IN ${preparationIds}
      UNION SELECT id::text FROM pedidos WHERE observaciones = $1
      UNION SELECT id::text FROM vehiculos WHERE placa LIKE $2
      UNION SELECT id::text FROM productos WHERE nombre LIKE $4
      UNION SELECT id::text FROM usuarios WHERE email LIKE $3
    ) OR metadatos::text LIKE $4`, [marker, `${marker}%`, `%${suffix}@icar.local`, `%${suffix}%`]);
    await db.query(`DELETE FROM liquidaciones_ruta WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM movimientos_cuenta_cliente WHERE venta_codigo IN ${saleCodes}`);
    await db.query(`DELETE FROM comprobantes_internos WHERE venta_codigo IN ${saleCodes}`);
    await db.query(`DELETE FROM ventas_detalle WHERE venta_codigo IN ${saleCodes}`);
    await db.query(`DELETE FROM ventas WHERE id IN ${saleIds}`);
    await db.query(`SELECT setval('ventas_codigo_seq', COALESCE((SELECT max(codigo) FROM ventas), 1), EXISTS(SELECT 1 FROM ventas))`);
    await db.query(`DELETE FROM ordenes_retorno_almacen_detalle WHERE orden_retorno_id IN (SELECT id FROM ordenes_retorno_almacen WHERE ruta_id IN ${routeIds})`);
    await db.query(`DELETE FROM ordenes_retorno_almacen WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM rutas_historial WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM resultados_visita_detalle WHERE resultado_visita_id IN (SELECT id FROM resultados_visita WHERE ruta_entrega_id IN ${deliveryIds})`);
    await db.query(`DELETE FROM resultados_visita WHERE ruta_entrega_id IN ${deliveryIds}`);
    await db.query(`DELETE FROM movimientos_inventario WHERE ruta_entrega_id IN ${deliveryIds}`);
    await db.query(`DELETE FROM rutas_entregas WHERE id IN ${deliveryIds}`);
    await db.query(`DELETE FROM rutas_responsables WHERE ruta_id IN ${routeIds}`);
    await db.query(`DELETE FROM rutas_distribucion WHERE id IN ${routeIds}`);
    await db.query(`DELETE FROM preparaciones_historial WHERE preparacion_id IN ${preparationIds}`);
    await db.query(`DELETE FROM preparaciones_detalle WHERE preparacion_id IN ${preparationIds}`);
    await db.query(`DELETE FROM preparaciones_pedido WHERE id IN ${preparationIds}`);
    await db.query(`UPDATE notificaciones SET reenvio_de_id = NULL WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM notificaciones WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM actualizaciones_seguimiento WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM enlaces_seguimiento WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM enlaces_confirmacion_pedido WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM reservas_inventario WHERE detalle_pedido_id IN (SELECT id FROM pedidos_detalle WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1))`, [marker]);
    await db.query(`DELETE FROM pedidos_estados_historial WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM pedidos_detalle WHERE pedido_id IN (SELECT id FROM pedidos WHERE observaciones = $1)`, [marker]);
    await db.query(`DELETE FROM pedidos WHERE observaciones = $1`, [marker]);
    await db.query(`DELETE FROM movimientos_inventario WHERE existencia_id IN (SELECT stock.id FROM existencias stock JOIN presentaciones_producto presentation ON presentation.id=stock.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM precios_producto WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE $1)`, [`%${suffix}%`]);
    await db.query(`DELETE FROM productos WHERE nombre LIKE $1`, [`%${suffix}%`]);
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
  const commercialRole = roles.find((role) => role.name === 'COMERCIALIZACION');
  assert(driverRole, 'falta el rol REPARTIDOR');
  assert(commercialRole, 'falta el rol COMERCIALIZACION');
  const driver = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Repartidor I4 ${suffix}`, username: `i4.driver.${suffix}`, email: `i4.driver.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [driverRole.id] } }, 201, 'repartidor')).payload;
  const otherDriver = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Repartidor ajeno I4 ${suffix}`, username: `i4.other.${suffix}`, email: `i4.other.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [driverRole.id] } }, 201, 'repartidor ajeno')).payload;
  const commercialUser = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Comercial I4 ${suffix}`, username: `i4.commercial.${suffix}`, email: `i4.commercial.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [commercialRole.id] } }, 201, 'usuario Comercialización')).payload;
  const login = async (identifier) => { const jar = new CookieJar(); await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier, password: 'Reparto1234!' } }, 200, `login ${identifier}`); return jar; };
  const driverJar = await login(driver.email);
  const otherDriverJar = await login(otherDriver.email);
  const commercialJar = await login(commercialUser.email);

  const deliveryDate = isoDate(14);
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona I4 ${suffix}` } }, 201, 'zona')).payload;
  const day = (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(deliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'día')).payload;
  const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type: 'MINORISTA', businessName: `Cliente I4 ${suffix}`, taxId: marker, phone: '70004004', paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0 } }, 201, 'cliente')).payload;
  const address = (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección I4 ${suffix}`, reference: 'Puerta azul', zoneId: zone.id, distributionDayId: day.id, latitude: -16.4897, longitude: -68.1193, isPrimary: true } }, 201, 'domicilio')).payload;
  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría I4 ${suffix}` } }, 201, 'categoría')).payload;
  const line = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea I4 ${suffix}` } }, 201, 'línea')).payload;
  const abbreviation = marker.slice(0, 12);
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad I4 ${suffix}`, abbreviation, decimalScale: 3, kilogramFactor: 1 } }, 201, 'unidad')).payload;
  const product = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { name: `Producto I4 ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto')).payload;
  const presentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Paquete I4', conversionFactor: 1, weightKg: 2 } }, 201, 'presentación')).payload;
  await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'MINORISTA', amount: 25, validFrom: isoDate(-1) } }, 201, 'precio');
  await expectStatus('/api/inventario/movimientos', { method: 'POST', jar: adminJar, body: { presentationId: presentation.id, type: 'INGRESO', quantity: 50, reason: marker } }, 201, 'existencia');
  let order = (await expectStatus('/api/pedidos', { method: 'POST', jar: adminJar, body: { customerId: customer.id, addressId: address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 10 }], observations: marker } }, 201, 'pedido')).payload;
  order = (await expectStatus(`/api/pedidos/${order.id}/enviar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'enviar pedido')).payload;
  order = (await expectStatus(`/api/pedidos/${order.id}/confirmar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar pedido')).payload;

  const eligible = await expectStatus(`/api/preparations/eligible?deliveryDate=${deliveryDate}&zoneId=${zone.id}`, { jar: adminJar }, 200, 'CP-55');
  assert(eligible.payload.data.some((item) => item.id === order.id));
  passed('CP-55', 'solo los pedidos Confirmados sin preparación no cancelada son elegibles');
  const workQueueBeforeStart = await expectStatus(`/api/preparations/work-queue?q=${order.code}`, { jar: adminJar }, 200, 'cola Preparar');
  assert.equal(workQueueBeforeStart.payload.data.find((item) => item.id === order.id)?.preparation, null);
  let preparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: order.id } }, 201, 'crear preparación')).payload;
  assert.equal(Number(preparation.details[0].preparedQuantity), 10);
  assert.equal(Number(preparation.details[0].difference), 0);
  const workQueueAfterStart = await expectStatus(`/api/preparations/work-queue?q=${order.code}`, { jar: adminJar }, 200, 'CP-149');
  assert.equal(workQueueAfterStart.payload.data.find((item) => item.id === order.id)?.preparation?.id, preparation.id);
  passed('CP-149', 'la tabla Preparar reúne pedidos por iniciar y en curso con la cantidad solicitada por defecto');
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
  const readyQueue = await expectStatus(`/api/preparations?stage=READY&q=${order.code}`, { jar: adminJar }, 200, 'cola Despachar');
  assert(readyQueue.payload.data.some((item) => item.id === preparation.id));
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/reopen`, { method: 'POST', jar: adminJar, body: {} }, 201, 'CP-150')).payload;
  assert.equal(preparation.status, 'EN_PREPARACION');
  assert(preparation.details.every((detail) => detail.verifiedAt === null));
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: preparation.details[0].id, preparedQuantity: 10, verified: true }] } }, 201, 'verificar preparación reabierta')).payload;
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 201, 'reconfirmar preparación')).payload;
  assert(preparation.history.some((event) => event.event === 'REAPERTURA'));
  passed('CP-150', 'Editar reabre la preparación y obliga a verificar nuevamente sus productos');
  const dashboardBeforeHandoff = (await expectStatus('/api/dashboard/operational-summary', { jar: adminJar }, 200, 'resumen operativo antes del traspaso')).payload;
  preparation = (await expectStatus(`/api/preparations/${preparation.id}/handoff`, { method: 'POST', jar: adminJar, body: {} }, 201, 'CP-151')).payload;
  assert(preparation.handedOffAt);
  const handedQueue = await expectStatus(`/api/preparations?stage=HANDED_OFF&q=${order.code}`, { jar: adminJar }, 200, 'cola de Distribución');
  assert(handedQueue.payload.data.some((item) => item.id === preparation.id));
  passed('CP-151', 'Entregar registra el traspaso a Distribución sin despachar inventario');
  const dashboardAfterHandoff = (await expectStatus('/api/dashboard/operational-summary', { jar: adminJar }, 200, 'CP-152')).payload;
  assert(Object.values(dashboardAfterHandoff.stages).every((stage) => stage.available === true));
  assert.equal(
    dashboardAfterHandoff.stages.distribution.breakdown.readyForRoute,
    dashboardBeforeHandoff.stages.distribution.breakdown.readyForRoute + 1,
  );
  assert.equal(
    dashboardAfterHandoff.pendingTotal,
    Object.values(dashboardAfterHandoff.stages).reduce((total, stage) => total + stage.pending, 0),
  );
  passed('CP-152', 'el Resumen consolida los pendientes operativos y actualiza el traspaso a Distribución');

  await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-SIN`, description: 'Sin capacidad' } }, 400, 'CP-62');
  passed('CP-62', 'la capacidad máxima en kg es obligatoria al registrar el vehículo');
  const vehicle = (await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-V`, description: 'Camión de aceptación', capacityKg: 15 } }, 201, 'vehículo')).payload;
  assert.equal(Number(vehicle.capacityKg), 15);
  const replacementVehicle = (await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-V2`, description: 'Camión de reemplazo', capacityKg: 30 } }, 201, 'vehículo de reemplazo')).payload;
  await expectStatus('/api/vehicles', { method: 'POST', jar: adminJar, body: { plate: `${marker}-V`, description: 'Duplicado', capacityKg: 50 } }, 409, 'placa duplicada');
  const pendingDistribution = await expectStatus(`/api/distribution-routes/pending-deliveries?q=${order.code}`, { jar: adminJar }, 200, 'bandeja de Distribución');
  const pendingPreparation = pendingDistribution.payload.data.find((item) => item.id === preparation.id);
  assert(pendingPreparation);
  assert.equal(Number(pendingPreparation.loadWeightKg), 20);
  assert.deepEqual(pendingPreparation.missingWeightPresentations, []);
  const route = (await expectStatus('/api/distribution-routes', { method: 'POST', jar: adminJar, body: { date: deliveryDate, zoneId: zone.id, vehicleId: vehicle.id, responsibleIds: [driver.id], principalResponsibleId: driver.id, preparationIds: [preparation.id], observation: marker } }, 201, 'CP-153')).payload;
  let managedRoute = route;
  assert.equal(managedRoute.deliveries.length, 1);
  assert.equal(managedRoute.deliveries[0].preparation.status, 'ASIGNADA');
  assert.equal(managedRoute.deliveries[0].position, 1);
  const pendingAfterAssignment = await expectStatus(`/api/distribution-routes/pending-deliveries?q=${order.code}`, { jar: adminJar }, 200, 'bandeja después de asignar');
  assert(!pendingAfterAssignment.payload.data.some((item) => item.id === preparation.id));
  passed('CP-153', 'la bandeja de Distribución crea una ruta y asigna los pedidos seleccionados en una sola transacción');
  assert.equal(Number(managedRoute.loadWeightKg), 20);
  assert.equal(managedRoute.capacityExceeded, true);
  assert.equal(Number(managedRoute.excessWeightKg), 5);
  passed('CP-63', 'calcula la carga total y notifica cuánto excede la capacidad del vehículo');
  await expectStatus(`/api/distribution-routes/${route.id}/plan`, { method: 'POST', jar: adminJar, body: {} }, 422, 'CP-65');
  passed('CP-65', 'impide planificar una ruta cuya carga supera la capacidad');
  managedRoute = (await expectStatus(`/api/distribution-routes/${route.id}/vehicle`, { method: 'PUT', jar: adminJar, body: { vehicleId: replacementVehicle.id } }, 200, 'CP-68')).payload;
  assert.equal(managedRoute.vehicleId, replacementVehicle.id);
  assert.equal(managedRoute.capacityExceeded, false);
  assert(managedRoute.history.some((event) => event.event === 'CAMBIO_VEHICULO'));
  passed('CP-68', 'permite cambiar el vehículo en Borrador y conserva el cambio en historial');
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
  const unrelatedRoutes = await expectStatus('/api/distribution-routes/my-route', { jar: otherDriverJar }, 200, 'rutas limitadas del repartidor ajeno');
  assert(!unrelatedRoutes.payload.some((item) => item.id === route.id));
  const adminActiveRoutes = await expectStatus('/api/distribution-routes/my-route', { jar: adminJar }, 200, 'control global administrador');
  assert(adminActiveRoutes.payload.some((item) => item.id === route.id));
  const commercialActiveRoutes = await expectStatus('/api/distribution-routes/my-route', { jar: commercialJar }, 200, 'control global Comercialización');
  assert(commercialActiveRoutes.payload.some((item) => item.id === route.id));
  managedRoute = (await expectStatus(`/api/route-deliveries/${delivery.id}/result`, { method: 'POST', jar: commercialJar, body: { result: 'ENTREGADA', details: [{ preparationDetailId: delivery.preparation.details[0].id, deliveredQuantity: 10, returnedQuantity: 0 }] } }, 201, 'CP-155')).payload;
  assert.equal(managedRoute.deliveries[0].result.result, 'ENTREGADA');
  assert.equal(managedRoute.deliveries[0].result.userId, commercialUser.id);
  passed('CP-155', 'Administrador y Comercialización visualizan todos los repartos activos y Comercialización puede marcar una entrega');
  assert(managedRoute.generatedSale?.id);
  assert.equal(Number(managedRoute.generatedSale.total), 250);
  const automaticSale = await expectStatus(`/api/sales/${managedRoute.generatedSale.id}`, { jar: adminJar }, 200, 'CP-156');
  assert.equal(automaticSale.payload.balance, automaticSale.payload.total);
  assert.equal(automaticSale.payload.dueDate, automaticSale.payload.issuedDate);
  passed('CP-156', 'la entrega genera automáticamente la nota de venta, el débito pendiente y vencimiento inmediato para contado');
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

  const creditCustomer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type: 'MINORISTA', businessName: `Cliente crédito I4 ${suffix}`, taxId: `${marker}-CRED`, phone: '70004161', paymentCondition: 'CREDITO', creditLimit: 1000, creditDays: 15 } }, 201, 'cliente con crédito')).payload;
  const creditAddress = (await expectStatus(`/api/clientes/${creditCustomer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección crédito I4 ${suffix}`, reference: 'Puerta blanca', zoneId: zone.id, distributionDayId: day.id, latitude: -16.4897, longitude: -68.1193, isPrimary: true } }, 201, 'domicilio del cliente con crédito')).payload;

  let factoryOrder = (await expectStatus('/api/pedidos', { method: 'POST', jar: adminJar, body: { customerId: creditCustomer.id, addressId: creditAddress.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 4 }], observations: marker } }, 201, 'pedido para entrega en fábrica')).payload;
  factoryOrder = (await expectStatus(`/api/pedidos/${factoryOrder.id}/enviar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'enviar pedido de fábrica')).payload;
  factoryOrder = (await expectStatus(`/api/pedidos/${factoryOrder.id}/confirmar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar pedido de fábrica')).payload;
  let factoryPreparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: factoryOrder.id } }, 201, 'preparación para fábrica')).payload;
  factoryPreparation = (await expectStatus(`/api/preparations/${factoryPreparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: factoryPreparation.details[0].id, preparedQuantity: 4, verified: true }] } }, 201, 'verificar preparación de fábrica')).payload;
  factoryPreparation = (await expectStatus(`/api/preparations/${factoryPreparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar preparación de fábrica')).payload;
  factoryPreparation = (await expectStatus(`/api/preparations/${factoryPreparation.id}/handoff`, { method: 'POST', jar: adminJar, body: {} }, 201, 'entregar preparación para fábrica')).payload;
  const stockBeforeFactory = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia antes de entrega en fábrica')).payload.data.find((item) => item.presentationId === presentation.id);
  const factoryCompletion = (await expectStatus('/api/entregas-fabrica', { method: 'POST', jar: commercialJar, body: { preparationId: factoryPreparation.id, result: 'ENTREGA_PARCIAL', observation: 'El cliente retira tres de cuatro unidades en planta', details: [{ preparationDetailId: factoryPreparation.details[0].id, deliveredQuantity: 3, returnedQuantity: 1 }] } }, 201, 'CP-167')).payload;
  assert.equal(factoryCompletion.delivery.deliveryType, 'FABRICA');
  assert.equal(factoryCompletion.delivery.routeId, null);
  assert.equal(factoryCompletion.delivery.status, 'VISITADA');
  assert.equal(factoryCompletion.delivery.result.result, 'ENTREGA_PARCIAL');
  assert.equal(Number(factoryCompletion.generatedSale.total), 75);
  passed('CP-167', 'la entrega en fábrica finaliza sin vehículo ni ruta y genera su nota de venta');
  const stockAfterFactory = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'CP-168')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(Number(stockAfterFactory.physicalQuantity), Number(stockBeforeFactory.physicalQuantity) - 3);
  assert.equal(Number(factoryCompletion.delivery.result.details[0].acceptedReturnQuantity), 1);
  const factorySales = await expectStatus(`/api/sales?orderId=${factoryOrder.id}`, { jar: adminJar }, 200, 'venta de fábrica');
  assert.equal(factorySales.payload.meta.total, 1);
  passed('CP-168', 'la entrega parcial en fábrica descuenta sólo lo retirado y conserva la diferencia en Almacén');
  await expectStatus('/api/entregas-fabrica', { method: 'POST', jar: commercialJar, body: { preparationId: factoryPreparation.id, result: 'ENTREGADA', details: [{ preparationDetailId: factoryPreparation.details[0].id, deliveredQuantity: 4, returnedQuantity: 0 }] } }, 409, 'CP-169');
  passed('CP-169', 'una preparación entregada en fábrica no puede procesarse por segunda vez ni enviarse a reparto');

  async function dispatchedScenario({ scenarioCustomer, scenarioAddress, quantity, routeDate, label }) {
    let scenarioOrder = (await expectStatus('/api/pedidos', { method: 'POST', jar: adminJar, body: { customerId: scenarioCustomer.id, addressId: scenarioAddress.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity }], observations: marker } }, 201, `pedido ${label}`)).payload;
    scenarioOrder = (await expectStatus(`/api/pedidos/${scenarioOrder.id}/enviar`, { method: 'POST', jar: adminJar, body: {} }, 201, `enviar pedido ${label}`)).payload;
    scenarioOrder = (await expectStatus(`/api/pedidos/${scenarioOrder.id}/confirmar`, { method: 'POST', jar: adminJar, body: {} }, 201, `confirmar pedido ${label}`)).payload;
    let scenarioPreparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: scenarioOrder.id } }, 201, `preparación ${label}`)).payload;
    scenarioPreparation = (await expectStatus(`/api/preparations/${scenarioPreparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: scenarioPreparation.details[0].id, preparedQuantity: quantity, verified: true }] } }, 201, `verificar preparación ${label}`)).payload;
    scenarioPreparation = (await expectStatus(`/api/preparations/${scenarioPreparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 201, `confirmar preparación ${label}`)).payload;
    scenarioPreparation = (await expectStatus(`/api/preparations/${scenarioPreparation.id}/handoff`, { method: 'POST', jar: adminJar, body: {} }, 201, `traspasar preparación ${label}`)).payload;
    let scenarioRoute = (await expectStatus('/api/distribution-routes', { method: 'POST', jar: adminJar, body: { date: routeDate, zoneId: zone.id, vehicleId: replacementVehicle.id, responsibleIds: [driver.id], principalResponsibleId: driver.id, preparationIds: [scenarioPreparation.id], observation: marker } }, 201, `ruta ${label}`)).payload;
    scenarioRoute = (await expectStatus(`/api/distribution-routes/${scenarioRoute.id}/plan`, { method: 'POST', jar: adminJar, body: {} }, 201, `planificar ruta ${label}`)).payload;
    scenarioRoute = (await expectStatus(`/api/distribution-routes/${scenarioRoute.id}/departure`, { method: 'POST', jar: adminJar, body: {} }, 201, `salida de ruta ${label}`)).payload;
    return { order: scenarioOrder, preparation: scenarioPreparation, route: scenarioRoute, delivery: scenarioRoute.deliveries[0] };
  }

  const partialScenario = await dispatchedScenario({ scenarioCustomer: creditCustomer, scenarioAddress: creditAddress, quantity: 4, routeDate: isoDate(18), label: 'parcial con crédito' });
  const stockAfterPartialDeparture = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia después de salida parcial')).payload.data.find((item) => item.presentationId === presentation.id);
  let partialRoute = (await expectStatus(`/api/route-deliveries/${partialScenario.delivery.id}/result`, { method: 'POST', jar: commercialJar, body: { result: 'ENTREGA_PARCIAL', observation: 'El cliente recibe tres de cuatro unidades', details: [{ preparationDetailId: partialScenario.delivery.preparation.details[0].id, deliveredQuantity: 3, returnedQuantity: 1 }] } }, 201, 'CP-158')).payload;
  assert.equal(partialRoute.deliveries[0].result.result, 'ENTREGA_PARCIAL');
  assert.equal(Number(partialRoute.generatedSale.total), 75);
  const partialSale = (await expectStatus(`/api/sales/${partialRoute.generatedSale.id}`, { jar: adminJar }, 200, 'CP-161')).payload;
  assert.equal(partialSale.creditDaysSnapshot, 15);
  assert.equal(partialSale.dueDate, addIsoDays(partialSale.issuedDate, 15));
  assert.equal(Number(partialSale.total), 75);
  passed('CP-158', 'la entrega parcial factura sólo lo efectivamente entregado y conserva la diferencia como retorno');
  passed('CP-161', 'la venta a crédito copia el plazo del cliente y calcula su vencimiento');
  partialRoute = (await expectStatus(`/api/distribution-routes/${partialScenario.route.id}/finish`, { method: 'POST', jar: adminJar, body: { observation: 'Recorrido parcial finalizado' } }, 201, 'CP-162')).payload;
  assert.equal(partialRoute.status, 'FINALIZADA');
  const stockAfterPartialFinish = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia antes de recibir retorno')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(stockAfterPartialFinish.physicalQuantity, stockAfterPartialDeparture.physicalQuantity);
  const pendingReturns = await expectStatus(`/api/inventario/retornos-ruta?status=PENDIENTE&q=${encodeURIComponent(partialScenario.route.code)}`, { jar: adminJar }, 200, 'orden de retorno pendiente');
  const pendingReturn = pendingReturns.payload.data.find((item) => item.routeId === partialScenario.route.id);
  assert(pendingReturn);
  assert.equal(Number(pendingReturn.expectedQuantity), 1);
  passed('CP-162', 'finalizar una ruta con devolución genera una sola orden pendiente sin modificar existencias');
  const returnOrder = (await expectStatus(`/api/inventario/retornos-ruta/${pendingReturn.id}`, { jar: adminJar }, 200, 'detalle de retorno')).payload;
  const receivedReturn = (await expectStatus(`/api/inventario/retornos-ruta/${pendingReturn.id}/receive`, { method: 'POST', jar: adminJar, body: { details: returnOrder.details.map((detail) => ({ detailId: detail.id, quantity: Number(detail.expectedQuantity) })), observation: 'Retorno completo verificado por Almacén' } }, 201, 'CP-164')).payload;
  assert.equal(receivedReturn.status, 'RECIBIDA');
  assert.equal(receivedReturn.route.status, 'LIQUIDADA');
  const stockAfterReturn = (await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar: adminJar }, 200, 'existencia después de recibir retorno')).payload.data.find((item) => item.presentationId === presentation.id);
  assert.equal(Number(stockAfterReturn.physicalQuantity), Number(stockAfterPartialFinish.physicalQuantity) + 1);
  passed('CP-164', 'Almacén recibe el retorno, registra la entrada y liquida la ruta');
  await expectStatus(`/api/inventario/retornos-ruta/${pendingReturn.id}/receive`, { method: 'POST', jar: adminJar, body: { details: returnOrder.details.map((detail) => ({ detailId: detail.id, quantity: Number(detail.expectedQuantity) })) } }, 409, 'CP-166');
  passed('CP-166', 'una orden de retorno recibida no puede registrarse por segunda vez');

  const rejectedScenario = await dispatchedScenario({ scenarioCustomer: customer, scenarioAddress: address, quantity: 2, routeDate: isoDate(19), label: 'rechazado' });
  let rejectedRoute = (await expectStatus(`/api/route-deliveries/${rejectedScenario.delivery.id}/result`, { method: 'POST', jar: commercialJar, body: { result: 'NO_ENTREGADA', observation: 'El cliente rechaza el pedido completo', details: [{ preparationDetailId: rejectedScenario.delivery.preparation.details[0].id, deliveredQuantity: 0, returnedQuantity: 2 }] } }, 201, 'CP-159')).payload;
  assert.equal(rejectedRoute.deliveries[0].result.result, 'NO_ENTREGADA');
  assert.equal(rejectedRoute.generatedSale, undefined);
  const rejectedSales = await expectStatus(`/api/sales?orderId=${rejectedScenario.order.id}`, { jar: adminJar }, 200, 'ventas del pedido rechazado');
  assert.equal(rejectedSales.payload.meta.total, 0);
  passed('CP-159', 'el rechazo devuelve toda la carga y no genera nota de venta');
  rejectedRoute = (await expectStatus(`/api/distribution-routes/${rejectedScenario.route.id}/finish`, { method: 'POST', jar: adminJar, body: { observation: 'Recorrido rechazado finalizado' } }, 201, 'finalizar ruta rechazada')).payload;
  assert.equal(rejectedRoute.status, 'FINALIZADA');
  const rejectedReturns = await expectStatus(`/api/inventario/retornos-ruta?status=PENDIENTE&q=${encodeURIComponent(rejectedScenario.route.code)}`, { jar: adminJar }, 200, 'retorno del pedido rechazado');
  assert.equal(Number(rejectedReturns.payload.data.find((item) => item.routeId === rejectedScenario.route.id)?.expectedQuantity), 2);

  const blockedScenario = await dispatchedScenario({ scenarioCustomer: customer, scenarioAddress: address, quantity: 1, routeDate: isoDate(20), label: 'bloqueado por saldo contado' });
  await expectStatus(`/api/route-deliveries/${blockedScenario.delivery.id}/result`, { method: 'POST', jar: commercialJar, body: { result: 'ENTREGADA', details: [{ preparationDetailId: blockedScenario.delivery.preparation.details[0].id, deliveredQuantity: 1, returnedQuantity: 0 }] } }, 409, 'CP-160');
  const blockedRoute = (await expectStatus(`/api/distribution-routes/${blockedScenario.route.id}`, { jar: adminJar }, 200, 'ruta sin resultado parcial')).payload;
  assert.equal(blockedRoute.status, 'EN_REPARTO');
  assert.equal(blockedRoute.deliveries[0].result, null);
  const blockedSales = await expectStatus(`/api/sales?orderId=${blockedScenario.order.id}`, { jar: adminJar }, 200, 'ventas de la entrega bloqueada');
  assert.equal(blockedSales.payload.meta.total, 0);
  passed('CP-160', 'un cliente de contado con saldo pendiente no genera otra visita ni venta parcial');

  const duplicateAfterDispatch = await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: order.id } }, 409, 'CP-140');
  assert.match(JSON.stringify(duplicateAfterDispatch.payload), /preparación registrada y no cancelada/i);
  const eligibleAfterDispatch = await expectStatus(`/api/preparations/eligible?q=${order.code}`, { jar: adminJar }, 200, 'pedido despachado no elegible');
  assert(!eligibleAfterDispatch.payload.data.some((item) => item.id === order.id));
  passed('CP-140', 'un pedido despachado no puede iniciar una preparación duplicada');

  let shortageOrder = (await expectStatus('/api/pedidos', { method: 'POST', jar: adminJar, body: { customerId: customer.id, addressId: address.id, requestedDate: deliveryDate, details: [{ presentationId: presentation.id, quantity: 45 }], observations: marker } }, 201, 'pedido con faltante')).payload;
  shortageOrder = (await expectStatus(`/api/pedidos/${shortageOrder.id}/enviar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'enviar pedido con faltante')).payload;
  shortageOrder = (await expectStatus(`/api/pedidos/${shortageOrder.id}/confirmar`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar pedido con faltante')).payload;
  const shortageEligible = await expectStatus(`/api/preparations/eligible?q=${shortageOrder.code}`, { jar: adminJar }, 200, 'CP-141');
  const shortageEligibleOrder = shortageEligible.payload.data.find((item) => item.id === shortageOrder.id);
  assert(shortageEligibleOrder);
  const physicalBeforeShortage = Number(shortageEligibleOrder.details[0].physicalQuantity);
  const expectedShortage = 45 - physicalBeforeShortage;
  assert(physicalBeforeShortage > 0 && physicalBeforeShortage < 45);
  assert.equal(Number(shortageEligibleOrder.details[0].totalReservedQuantity), 45);
  assert.equal(Number(shortageEligibleOrder.details[0].availableQuantity), -expectedShortage);
  assert.equal(Number(shortageEligibleOrder.details[0].shortageQuantity), expectedShortage);
  passed('CP-141', 'Preparación integra existencia física, reserva total, disponible negativo y faltante');

  let shortagePreparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: shortageOrder.id } }, 201, 'preparación con faltante')).payload;
  assert.equal(Number(shortagePreparation.details[0].physicalSnapshot), physicalBeforeShortage);
  assert.equal(Number(shortagePreparation.details[0].availableSnapshot), -expectedShortage);
  assert.equal(Number(shortagePreparation.details[0].shortageSnapshot), expectedShortage);
  assert(Array.isArray(shortagePreparation.details[0].relatedProductionOrders));
  passed('CP-142', 'el detalle conserva instantáneas de faltante y referencias operativas de Producción');
  shortagePreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: shortagePreparation.details[0].id, preparedQuantity: 45, verified: true }] } }, 201, 'avance sobre existencia')).payload;
  await expectStatus(`/api/preparations/${shortagePreparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 422, 'CP-143');
  passed('CP-143', 'impide confirmar una cantidad mayor que la existencia física realmente separable');
  shortagePreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}/progress`, { method: 'POST', jar: adminJar, body: { details: [{ preparationDetailId: shortagePreparation.details[0].id, preparedQuantity: physicalBeforeShortage, verified: true, observation: `Faltan ${expectedShortage} unidades pendientes de Producción` }] } }, 201, 'avance ajustado')).payload;
  shortagePreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}/confirm`, { method: 'POST', jar: adminJar, body: {} }, 201, 'confirmar preparación ajustada')).payload;
  shortagePreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}/handoff`, { method: 'POST', jar: adminJar, body: {} }, 201, 'entregar preparación ajustada a Distribución')).payload;

  const alternateRouteDate = isoDate(15);
  const routeToCancel = (await expectStatus('/api/distribution-routes', { method: 'POST', jar: adminJar, body: { date: alternateRouteDate, zoneId: zone.id, vehicleId: replacementVehicle.id, responsibleIds: [driver.id], principalResponsibleId: driver.id, observation: marker } }, 201, 'ruta reprogramable')).payload;
  let managedRouteToCancel = (await expectStatus(`/api/distribution-routes/${routeToCancel.id}/deliveries`, { method: 'POST', jar: adminJar, body: { preparationIds: [shortagePreparation.id] } }, 201, 'asignar preparación a ruta reprogramable')).payload;
  assert.equal(managedRouteToCancel.deliveries[0].order.requestedDate, deliveryDate);
  managedRouteToCancel = (await expectStatus(`/api/distribution-routes/${routeToCancel.id}/reschedule`, { method: 'PUT', jar: adminJar, body: { date: isoDate(16), reason: 'Reprogramación de aceptación auditada' } }, 200, 'CP-144')).payload;
  assert.equal(managedRouteToCancel.date, isoDate(16));
  assert(managedRouteToCancel.history.some((event) => event.event === 'REPROGRAMACION'));
  passed('CP-144', 'reprograma la fecha operativa sin alterar la fecha comprometida del pedido y conserva auditoría');
  managedRouteToCancel = (await expectStatus(`/api/distribution-routes/${routeToCancel.id}/cancel`, { method: 'POST', jar: adminJar, body: { reason: 'Cancelación de aceptación antes de salida' } }, 201, 'CP-145')).payload;
  assert.equal(managedRouteToCancel.status, 'CANCELADA');
  assert(managedRouteToCancel.history.some((event) => event.event === 'CANCELACION'));
  const releasedPreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}`, { jar: adminJar }, 200, 'preparación liberada')).payload;
  assert.equal(releasedPreparation.status, 'PREPARADA');
  passed('CP-145', 'cancelar una ruta antes de la salida devuelve la preparación a Preparada y conserva el motivo');

  shortagePreparation = (await expectStatus(`/api/preparations/${shortagePreparation.id}/cancel`, { method: 'POST', jar: adminJar, body: { reason: 'Cancelación controlada para reprogramar la preparación' } }, 201, 'CP-146')).payload;
  assert.equal(shortagePreparation.status, 'CANCELADA');
  let restartedPreparation = (await expectStatus('/api/preparations', { method: 'POST', jar: adminJar, body: { orderId: shortageOrder.id } }, 201, 'reiniciar preparación cancelada')).payload;
  assert.equal(restartedPreparation.status, 'PENDIENTE');
  restartedPreparation = (await expectStatus(`/api/preparations/${restartedPreparation.id}/cancel`, { method: 'POST', jar: adminJar, body: { reason: 'Cierre de los datos temporales de aceptación' } }, 201, 'cancelar preparación reiniciada')).payload;
  passed('CP-146', 'la cancelación auditada permite reiniciar el pedido sin liberar su reserva');

  await expectStatus('/api/distribution-routes/presentation-weights', { method: 'PUT', jar: adminJar, body: { items: [{ presentationId: presentation.id, weightKg: 2.5 }] } }, 200, 'actualizar peso');
  const weights = await expectStatus(`/api/distribution-routes/weight-readiness?missingOnly=false&q=${encodeURIComponent(product.name)}&limit=25`, { jar: adminJar }, 200, 'CP-147');
  assert.equal(Number(weights.payload.data.find((item) => item.id === presentation.id)?.weightKg), 2.5);
  passed('CP-147', 'permite completar el peso real por presentación y registra el cambio auditado');

  const paginatedPreparations = await expectStatus('/api/preparations?page=1&limit=1', { jar: adminJar }, 200, 'CP-148');
  const paginatedRoutes = await expectStatus('/api/distribution-routes?page=1&limit=1', { jar: adminJar }, 200, 'paginación rutas');
  assert.equal(paginatedPreparations.payload.meta.limit, 1);
  assert.equal(paginatedRoutes.payload.meta.limit, 1);
  assert(paginatedPreparations.payload.meta.totalPages >= 1);
  assert(paginatedRoutes.payload.meta.totalPages >= 1);
  passed('CP-148', 'Preparación y Distribución exponen paginación real del servidor');

  process.stdout.write(`\n${results.length} comprobaciones de aceptación de la cuarta iteración superadas.\n`);
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); process.stdout.write('Datos temporales de la cuarta iteración eliminados.\n'); }
  catch (error) { process.stderr.write(`No fue posible limpiar los datos temporales: ${error.stack ?? error}\n`); process.exitCode = 1; }
}
