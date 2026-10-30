import assert from 'node:assert/strict';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const identifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const password = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const suffix = process.env.ACCEPTANCE_SUFFIX ?? Date.now().toString(36);

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

async function dbClient() {
  const client = new pg.Client({ host: process.env.DATABASE_HOST, port: Number(process.env.DATABASE_PORT ?? 5432), database: process.env.DATABASE_NAME, user: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD });
  await client.connect();
  return client;
}

async function cleanup() {
  if (!process.env.DATABASE_HOST || process.env.ACCEPTANCE_KEEP_DATA === 'true') return;
  const db = await dbClient();
  const productName = `%${suffix}%`;
  try {
    await db.query('BEGIN');
    await db.query(`DELETE FROM movimientos_inventario WHERE entrega_produccion_id IN (SELECT delivery.id FROM entregas_produccion delivery JOIN consolidaciones_detalle detail ON detail.id=delivery.detalle_consolidado_id JOIN productos product ON product.id=detail.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM entregas_produccion WHERE detalle_consolidado_id IN (SELECT detail.id FROM consolidaciones_detalle detail JOIN productos product ON product.id=detail.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM registros_avance_produccion WHERE detalle_consolidado_id IN (SELECT detail.id FROM consolidaciones_detalle detail JOIN productos product ON product.id=detail.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`UPDATE solicitudes_abastecimiento SET estado='ENVIADA', consolidacion_produccion_id=NULL, programado_at=NULL, cerrado_at=NULL, cerrado_por=NULL, observacion_cierre=NULL WHERE id IN (SELECT request.id FROM solicitudes_abastecimiento request JOIN solicitudes_abastecimiento_detalle detail ON detail.solicitud_id=request.id JOIN presentaciones_producto presentation ON presentation.id=detail.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1) AND estado IN ('PROGRAMADA','CERRADA','CERRADA_INCOMPLETA')`, [productName]);
    await db.query(`DELETE FROM consolidaciones_produccion WHERE id IN (SELECT detail.consolidacion_id FROM consolidaciones_detalle detail JOIN productos product ON product.id=detail.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM solicitudes_abastecimiento WHERE id IN (SELECT request.id FROM solicitudes_abastecimiento request JOIN solicitudes_abastecimiento_detalle detail ON detail.solicitud_id=request.id JOIN presentaciones_producto presentation ON presentation.id=detail.presentacion_id JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM existencias WHERE presentacion_id IN (SELECT presentation.id FROM presentaciones_producto presentation JOIN productos product ON product.id=presentation.producto_id WHERE product.nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM presentaciones_producto WHERE producto_id IN (SELECT id FROM productos WHERE nombre LIKE $1)`, [productName]);
    await db.query(`DELETE FROM productos WHERE nombre LIKE $1`, [productName]);
    await db.query(`DELETE FROM areas_produccion WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM lineas_productivas WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM categorias_producto WHERE nombre LIKE $1`, [`%${suffix}%`]);
    await db.query(`DELETE FROM unidades_medida WHERE abreviatura LIKE $1`, [`PF${suffix.slice(-4).toUpperCase()}%`]);
    await db.query(`DELETE FROM eventos_auditoria WHERE metadatos::text LIKE $1`, [`%${suffix}%`]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; } finally { await db.end(); }
}

function futureDate(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1000 + [...suffix].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 500 + offset);
  return date.toISOString().slice(0, 10);
}

const jar = new CookieJar();
try {
  await expectStatus('/api/auth/login', { method: 'POST', jar, body: { identifier, password } }, 200, 'login');
  const category = await expectStatus('/api/categorias', { method: 'POST', jar, body: { name: `Categoría flujo producción ${suffix}` } }, 201, 'crear categoría');
  const area = await expectStatus('/api/production-areas', { method: 'POST', jar, body: { name: `Área planta ${suffix}`, categoryIds: [category.id] } }, 201, 'crear área');
  assert.equal(area.categories[0].id, category.id);
  await expectStatus('/api/production-areas', { method: 'POST', jar, body: { name: `Área duplicada ${suffix}`, categoryIds: [category.id] } }, 409, 'categoría única por área');
  process.stdout.write('✓ CP-P01 áreas configurables con categorías existentes y asignación única\n');

  const line = await expectStatus('/api/lineas-productivas', { method: 'POST', jar, body: { name: `Línea flujo producción ${suffix}` } }, 201, 'crear línea');
  const unit = await expectStatus('/api/unidades', { method: 'POST', jar, body: { name: `Bolsa flujo ${suffix}`, abbreviation: `PF${suffix.slice(-4)}U`.toUpperCase(), decimalScale: 3, kilogramFactor: 1 } }, 201, 'crear unidad');
  const product = await expectStatus('/api/productos', { method: 'POST', jar, body: { name: `Pan molde flujo ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'crear producto');
  const presentation = await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar, body: { unitId: unit.id, description: 'Bolsa de pan molde', conversionFactor: 1, weightKg: 1 } }, 201, 'crear presentación');

  const requiredDate = futureDate();
  await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: futureDate(1) } }, 422, 'rechazar orden sin origen');
  let stockRequest = await expectStatus('/api/inventario/solicitudes-abastecimiento', { method: 'POST', jar, body: { requiredDate } }, 201, 'crear solicitud de stock');
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 10, observation: 'Stock comercial para prueba de planta' }] } }, 200, 'guardar solicitud de stock');
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}/enviar`, { method: 'POST', jar, body: {} }, 201, 'enviar solicitud de stock');
  assert.equal(stockRequest.status, 'ENVIADA');

  let order = await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: requiredDate } }, 201, 'generar orden desde solicitud de stock');
  assert.equal(order.details.length, 1);
  assert.equal(Number(order.details[0].requestedQuantity), 0);
  assert.equal(Number(order.details[0].productionRequiredQuantity), 0);
  assert.equal(Number(order.details[0].stockRequestedQuantity), 10);
  assert.equal(Number(order.details[0].additionalProductionQuantity), 0);
  assert.equal(Number(order.details[0].plannedQuantity), 10);
  assert.equal(order.details[0].presentationId, presentation.id);
  assert.equal(order.details[0].productionAreaId, area.id);
  stockRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${stockRequest.id}`, { jar }, 200, 'solicitud programada');
  assert.equal(stockRequest.status, 'PROGRAMADA');
  assert.equal(stockRequest.productionConsolidationId, order.id);
  await expectStatus(`/api/production-consolidations/${order.id}/details`, { method: 'POST', jar, body: { presentationId: presentation.id, additionalQuantity: 1 } }, 404, 'ruta manual retirada');
  process.stdout.write('✓ CP-P02 una solicitud comercial crea una orden para stock aun sin pedidos\n');
  process.stdout.write('✓ CP-P03 la solicitud para stock queda separada del ajuste técnico de Producción\n');

  order = await expectStatus(`/api/production-consolidations/${order.id}/emit`, { method: 'POST', jar, body: {} }, 201, 'emitir orden');
  assert.equal(order.details[0].stage, 'PENDIENTE');
  const plantBoard = await expectStatus(`/api/production-consolidations/plant?productionAreaId=${area.id}`, { jar }, 200, 'tablero directo de planta');
  const visiblePlantOrder = plantBoard.find((item) => item.id === order.id);
  assert(visiblePlantOrder);
  assert.equal(visiblePlantOrder.details.length, 1);
  assert(visiblePlantOrder.details.every((detail) => detail.productionAreaId === area.id));
  order = await expectStatus(`/api/production-consolidations/${order.id}/details/${order.details[0].id}/start`, { method: 'POST', jar, body: {} }, 201, 'iniciar producto');
  assert.equal(order.status, 'EN_PROCESO');
  assert.equal(order.details[0].stage, 'EN_PROCESO');
  await expectStatus(`/api/production-consolidations/${order.id}/details/${order.details[0].id}/deliveries`, { method: 'POST', jar, body: { quantity: 12, finalDelivery: true } }, 422, 'diferencia sin incidencia');
  process.stdout.write('✓ CP-P04 el tablero abre directamente por área, inicia cada producto y exige documentar diferencias reales\n');

  const stockBeforeResponse = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar }, 200, 'stock previo');
  const stockBefore = stockBeforeResponse.data.find((item) => item.presentationId === presentation.id);
  const previousPhysical = Number(stockBefore?.physicalQuantity ?? 0);
  order = await expectStatus(`/api/production-consolidations/${order.id}/details/${order.details[0].id}/deliveries`, { method: 'POST', jar, body: { quantity: 4, finalDelivery: false } }, 201, 'primera entrega parcial');
  assert.equal(order.details[0].stage, 'PENDIENTE_RECEPCION');
  assert.equal(order.details[0].completedAt, null);
  assert.equal(order.details[0].deliveries.length, 1);
  assert(order.details[0].deliveries[0].deliveredAt);
  const stockStill = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar }, 200, 'stock antes de recepción');
  assert.equal(Number(stockStill.data.find((item) => item.presentationId === presentation.id)?.physicalQuantity ?? 0), previousPhysical);
  process.stdout.write('✓ CP-P05 la entrega de Producción no modifica existencias antes de Almacén\n');

  let deliveries = await expectStatus('/api/production-deliveries', { jar }, 200, 'primera entrega pendiente');
  const partialDelivery = deliveries.find((item) => item.consolidatedDetailId === order.details[0].id);
  assert(partialDelivery);
  assert.equal(partialDelivery.finalDelivery, false);
  assert(partialDelivery.deliveredAt);
  await expectStatus(`/api/production-deliveries/${partialDelivery.id}/receive`, { method: 'POST', jar, body: { receivedQuantity: 4 } }, 201, 'aceptar entrega parcial');
  order = await expectStatus(`/api/production-consolidations/${order.id}`, { jar }, 200, 'orden después de recepción parcial');
  assert.equal(order.details[0].stage, 'RECIBIDO_PARCIAL');
  assert.equal(Number(order.details[0].receivedQuantity), 4);
  order = await expectStatus(`/api/production-consolidations/${order.id}/details/${order.details[0].id}/deliveries`, { method: 'POST', jar, body: { quantity: 8, finalDelivery: true, incident: 'El batch real produjo dos bolsas adicionales' } }, 201, 'entrega final');
  assert.equal(order.details[0].stage, 'PENDIENTE_RECEPCION');
  assert.equal(Number(order.details[0].difference), 2);
  assert.equal(order.details[0].deliveries.length, 2);
  const finalRecorded = order.details[0].deliveries.find((item) => item.finalDelivery);
  assert(finalRecorded?.deliveredAt);
  assert.equal(new Date(order.details[0].completedAt).getTime(), new Date(finalRecorded.deliveredAt).getTime());
  const stockBeforeFinalReceipt = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar }, 200, 'stock después de la recepción parcial');
  assert.equal(Number(stockBeforeFinalReceipt.data.find((item) => item.presentationId === presentation.id)?.physicalQuantity ?? 0), previousPhysical + 4);
  deliveries = await expectStatus('/api/production-deliveries', { jar }, 200, 'entrega final pendiente');
  const delivery = deliveries.find((item) => item.consolidatedDetailId === order.details[0].id && item.finalDelivery);
  assert(delivery);
  assert.equal(delivery.consolidatedDetail.presentationId, presentation.id);
  await expectStatus(`/api/production-deliveries/${delivery.id}/receive`, { method: 'POST', jar, body: { receivedQuantity: 7.5 } }, 422, 'diferencia de recepción sin observación');
  await expectStatus(`/api/production-deliveries/${delivery.id}/receive`, { method: 'POST', jar, body: { receivedQuantity: 7.5, observation: 'Media bolsa observada durante el conteo' } }, 201, 'aceptar recepción final');
  const finished = await expectStatus(`/api/production-consolidations/${order.id}`, { jar }, 200, 'orden final');
  assert.equal(finished.status, 'CERRADA');
  assert.equal(finished.details[0].stage, 'CERRADO_CON_INCIDENCIA');
  assert.equal(Number(finished.details[0].receivedQuantity), 11.5);
  assert.equal(new Date(finished.details[0].completedAt).getTime(), new Date(finalRecorded.deliveredAt).getTime());
  const stockAfter = await expectStatus(`/api/inventario/existencias?limit=100&productId=${product.id}`, { jar }, 200, 'stock posterior');
  assert.equal(Number(stockAfter.data.find((item) => item.presentationId === presentation.id).physicalQuantity), previousPhysical + 11.5);
  const movements = await expectStatus(`/api/inventario/movimientos?limit=100&type=INGRESO_PRODUCCION`, { jar }, 200, 'movimiento producción');
  assert(movements.data.some((movement) => movement.productionDeliveryId === partialDelivery.id && Number(movement.quantity) === 4));
  assert(movements.data.some((movement) => movement.productionDeliveryId === delivery.id && Number(movement.quantity) === 7.5));
  process.stdout.write('✓ CP-P06 las entregas parciales continúan hasta la final, conservan su hora de fin y Almacén recibe cada tramo\n');

  const history = await expectStatus(`/api/production-consolidations/${order.id}/history`, { jar }, 200, 'historial');
  for (const event of ['GENERACION', 'EMISION', 'INICIO', 'ENTREGA_PRODUCCION', 'RECEPCION_ALMACEN', 'CIERRE']) assert(history.some((item) => item.event === event), `falta evento ${event}`);
  process.stdout.write('✓ CP-P07 la trazabilidad conserva todas las etapas por producto y orden\n');

  const flexibleDate = futureDate(2);
  let flexibleRequest = await expectStatus('/api/inventario/solicitudes-abastecimiento', { method: 'POST', jar, body: { requiredDate: flexibleDate } }, 201, 'crear solicitud flexible');
  flexibleRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${flexibleRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 10, observation: 'Prueba de programación flexible' }] } }, 200, 'guardar solicitud flexible');
  flexibleRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${flexibleRequest.id}/enviar`, { method: 'POST', jar, body: {} }, 201, 'enviar solicitud flexible');
  const inbox = await expectStatus('/api/production-stock-requests', { jar }, 200, 'bandeja de solicitudes pendientes');
  assert(inbox.some((item) => item.id === flexibleRequest.id));
  const acceptedDeliveryDate = futureDate(4);
  let flexibleOrder = await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: acceptedDeliveryDate, stockRequestId: flexibleRequest.id } }, 201, 'aceptar solicitud con otra fecha de entrega');
  assert.equal(flexibleOrder.deliveryDate, acceptedDeliveryDate);
  assert.equal(flexibleOrder.details[0].stockRequestDetail.request.id, flexibleRequest.id);
  assert.equal(Number(flexibleOrder.details[0].stockRequestedQuantity), 10);
  process.stdout.write('✓ CP-P11 Producción modifica la fecha de entrega sin perder la solicitud ni su cantidad de origen\n');
  const flexibleDetail = flexibleOrder.details[0];
  const earlyDate = futureDate(1);
  flexibleOrder = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/details/${flexibleDetail.id}/schedule`, { method: 'PATCH', jar, body: { scheduledDate: earlyDate, sequence: 2, additionalQuantity: 2, reason: 'Completar batch de doce bolsas' } }, 200, 'programar antes de fecha requerida');
  assert.equal(flexibleOrder.details[0].scheduledDate, earlyDate);
  assert.equal(flexibleOrder.details[0].sequence, 2);
  assert.equal(Number(flexibleOrder.details[0].plannedQuantity), 12);
  process.stdout.write('✓ CP-P08 Producción programa cada producto antes o después sin bloquear por fecha\n');

  flexibleOrder = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/emit`, { method: 'POST', jar, body: {} }, 201, 'emitir orden flexible');
  flexibleOrder = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/details/${flexibleDetail.id}/start`, { method: 'POST', jar, body: {} }, 201, 'iniciar fuera de fecha programada');
  flexibleOrder = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/details/${flexibleDetail.id}/deliveries`, { method: 'POST', jar, body: { quantity: 7, finalDelivery: false } }, 201, 'entrega parcial antes del cierre incompleto');
  const flexibleDeliveries = await expectStatus('/api/production-deliveries', { jar }, 200, 'entrega flexible pendiente');
  const flexibleDelivery = flexibleDeliveries.find((item) => item.consolidatedDetailId === flexibleDetail.id);
  assert(flexibleDelivery);
  await expectStatus(`/api/production-deliveries/${flexibleDelivery.id}/receive`, { method: 'POST', jar, body: { receivedQuantity: 7 } }, 201, 'recibir producción incompleta');
  const stillOpen = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}`, { jar }, 200, 'orden parcial permanece abierta');
  assert.equal(stillOpen.status, 'EN_PROCESO');
  assert.equal(stillOpen.details[0].stage, 'RECIBIDO_PARCIAL');
  await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/close`, { method: 'POST', jar, body: { observation: 'Faltante conocido' } }, 422, 'evitar cierre normal con faltantes');
  await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/close-incomplete`, { method: 'POST', jar, body: { reason: '' } }, 400, 'exigir observación de cierre incompleto');
  flexibleOrder = await expectStatus(`/api/production-consolidations/${flexibleOrder.id}/close-incomplete`, { method: 'POST', jar, body: { reason: 'Falla de equipo impidió completar cinco bolsas' } }, 201, 'cerrar orden incompleta');
  assert.equal(flexibleOrder.status, 'CERRADA_INCOMPLETA');
  flexibleRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${flexibleRequest.id}`, { jar }, 200, 'solicitud cerrada incompleta');
  assert.equal(flexibleRequest.status, 'CERRADA_INCOMPLETA');
  assert.match(flexibleRequest.closeObservation, /Falla de equipo/);
  process.stdout.write('✓ CP-P09 el faltante exige cierre incompleto documentado y cierra igual la solicitud de Almacén\n');

  const cancelDate = futureDate(3);
  let cancelRequest = await expectStatus('/api/inventario/solicitudes-abastecimiento', { method: 'POST', jar, body: { requiredDate: cancelDate } }, 201, 'crear solicitud a cancelar');
  cancelRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${cancelRequest.id}`, { method: 'PATCH', jar, body: { items: [{ presentationId: presentation.id, additionalStockQuantity: 4, observation: 'Prueba de cancelación completa' }] } }, 200, 'guardar solicitud a cancelar');
  cancelRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${cancelRequest.id}/enviar`, { method: 'POST', jar, body: {} }, 201, 'enviar solicitud a cancelar');
  let cancelOrder = await expectStatus('/api/production-consolidations', { method: 'POST', jar, body: { deliveryDate: cancelDate, stockRequestId: cancelRequest.id } }, 201, 'generar orden a cancelar');
  cancelOrder = await expectStatus(`/api/production-consolidations/${cancelOrder.id}/cancel`, { method: 'POST', jar, body: { reason: 'Solicitud retirada por el responsable comercial' } }, 201, 'cancelar orden');
  assert.equal(cancelOrder.status, 'CANCELADA');
  assert.equal(cancelOrder.details[0].stage, 'CANCELADO');
  cancelRequest = await expectStatus(`/api/inventario/solicitudes-abastecimiento/${cancelRequest.id}`, { jar }, 200, 'solicitud asociada cancelada');
  assert.equal(cancelRequest.status, 'CERRADA_INCOMPLETA');
  process.stdout.write('✓ CP-P10 una orden sin recepciones puede cancelarse y conserva el motivo\n');

  process.stdout.write('\n11 pruebas de aceptación del flujo Producción–Almacén superadas.\n');
} catch (error) {
  process.stderr.write(`\nFallo de aceptación: ${error.stack ?? error}\n`);
  process.exitCode = 1;
} finally {
  try { await cleanup(); process.stdout.write('Datos temporales del flujo eliminados.\n'); }
  catch (error) { process.stderr.write(`No se pudo limpiar: ${error.stack ?? error}\n`); process.exitCode = 1; }
}
