import assert from 'node:assert/strict';
const { default: pg } = await import(process.env.ACCEPTANCE_PG_MODULE ?? 'pg');

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


assert.equal(process.env.DATABASE_NAME, 'icar_workflow_validation', 'Esta prueba solo puede ejecutarse en la base aislada icar_workflow_validation');
assert.equal(process.env.NOTIFICATION_WORKER_ENABLED, 'false', 'La prueba exige el trabajador WhatsApp desactivado');
const db=await databaseClient();
try {
  const adminJar = new CookieJar();
  await expectStatus('/api/auth/login', { method: 'POST', jar: adminJar, body: { identifier: adminIdentifier, password: adminPassword } }, 200, 'login administrador');
  const roles = (await expectStatus('/api/roles', { jar: adminJar }, 200, 'roles')).payload;
  const driverRole = roles.find((role) => role.name === 'REPARTIDOR');
  const commercialRole = roles.find((role) => role.name === 'COMERCIALIZACION');
  assert(driverRole, 'falta el rol REPARTIDOR');
  assert(commercialRole, 'falta el rol COMERCIALIZACION');
  const driver = (await expectStatus('/api/usuarios', { method: 'POST', jar: adminJar, body: { name: `Repartidor I4 ${suffix}`, username: `i4.driver.${suffix}`, email: `i4.driver.${suffix}@icar.local`, password: 'Reparto1234!', roleIds: [driverRole.id] } }, 201, 'repartidor')).payload;
  const deliveryDate = isoDate(14);
  const zone = (await expectStatus('/api/zonas', { method: 'POST', jar: adminJar, body: { name: `Zona I4 ${suffix}` } }, 201, 'zona')).payload;
  const day = (await expectStatus(`/api/zonas/${zone.id}/dias-distribucion`, { method: 'POST', jar: adminJar, body: { weekday: weekday(deliveryDate), startTime: '08:00', endTime: '17:00' } }, 201, 'día')).payload;
  const customer = (await expectStatus('/api/clientes', { method: 'POST', jar: adminJar, body: { type: 'MINORISTA', businessName: `Cliente I4 ${suffix}`, taxId: marker, phone: '70004004', paymentCondition: 'CREDITO', creditLimit: 100000, creditDays: 30 } }, 201, 'cliente')).payload;
  const address = (await expectStatus(`/api/clientes/${customer.id}/domicilios`, { method: 'POST', jar: adminJar, body: { label: 'Principal', address: `Dirección I4 ${suffix}`, reference: 'Puerta azul', zoneId: zone.id, distributionDayId: day.id, latitude: -16.4897, longitude: -68.1193, isPrimary: true } }, 201, 'domicilio')).payload;
  const category = (await expectStatus('/api/categorias', { method: 'POST', jar: adminJar, body: { name: `Categoría I4 ${suffix}` } }, 201, 'categoría')).payload;
  const line = (await expectStatus('/api/lineas-productivas', { method: 'POST', jar: adminJar, body: { name: `Línea I4 ${suffix}` } }, 201, 'línea')).payload;
  const abbreviation = marker.slice(0, 12);
  const unit = (await expectStatus('/api/unidades', { method: 'POST', jar: adminJar, body: { name: `Unidad I4 ${suffix}`, abbreviation, decimalScale: 3, kilogramFactor: 1 } }, 201, 'unidad')).payload;
  const product = (await expectStatus('/api/productos', { method: 'POST', jar: adminJar, body: { name: `Producto I4 ${suffix}`, categoryId: category.id, productLineId: line.id, baseUnitId: unit.id } }, 201, 'producto')).payload;
  const presentation = (await expectStatus(`/api/productos/${product.id}/presentaciones`, { method: 'POST', jar: adminJar, body: { unitId: unit.id, description: 'Paquete I4', conversionFactor: 1, weightKg: 2 } }, 201, 'presentación')).payload;
  await expectStatus(`/api/presentaciones/${presentation.id}/precios`, { method: 'POST', jar: adminJar, body: { customerType: 'MINORISTA', amount: 25, validFrom: isoDate(-1) } }, 201, 'precio');

  const api=async(path,body,method=body===undefined?'GET':'POST',status=body===undefined?200:201)=>(await expectStatus(path,{method,body,jar:adminJar},status,path)).payload;
  const stage=async(id)=>(await api(`/api/pedidos/${id}`)).operationalStatus;
  const tokenFor=async(id)=>{const row=await db.query(`SELECT cuerpo_renderizado FROM notificaciones WHERE pedido_id=$1 AND evento='PEDIDO_BORRADOR'`,[id]);const match=row.rows[0]?.cuerpo_renderizado.match(/\/seguimiento\/([A-Za-z0-9_-]+)/);assert(match,'borrador debe incluir enlace de seguimiento');return match[1]};
  const publicState=async(token)=>(await expectStatus(`/api/public/tracking/${token}`,{},200,'seguimiento público')).payload;
  for(const event of ['PEDIDO_BORRADOR','PEDIDO_CONFIRMADO','SALIDA_RUTA','ENTREGADO'])await api('/api/notification-event-settings',{event,enabled:true});
  for(const event of ['EN_PREPARACION','DISPONIBLE_PARA_PREPARAR','PREPARADO','ASIGNADO','ENTREGA_PARCIAL'])await api('/api/notification-event-settings',{event,enabled:false});
  const orders=[];const tokens=[];
  for(let i=0;i<5;i++){
    const order=await api('/api/pedidos',{customerId:customer.id,addressId:address.id,requestedDate:deliveryDate,details:[{presentationId:presentation.id,quantity:10}],observations:marker});orders.push(order);tokens.push(await tokenFor(order.id));
  }
  assert.equal((await publicState(tokens[0])).status,'BORRADOR');
  await db.query('UPDATE enlaces_seguimiento SET token_cifrado=NULL WHERE pedido_id=$1',[orders[0].id]);passed('WF-01','borrador genera enlace e historial sin confirmar');
  // Confirm the newer order first: stock priority must still use the original creation date.
  for(const index of [1,0,2,3,4]){await api(`/api/pedidos/${orders[index].id}/enviar`,{});await api(`/api/pedidos/${orders[index].id}/confirmar`,{});}
  assert.equal((await publicState(tokens[0])).status,'EN_PREPARACION');
  assert.equal(await stage(orders[0].id),'EN_PREPARACION');
  let stock=(await api(`/api/inventario/existencias?productId=${product.id}`)).data[0];
  assert.equal(Number(stock.reservedQuantity),50);assert.equal(Number(stock.availableQuantity),-50);passed('WF-02','confirmación reserva la demanda completa y muestra saldo negativo');
  await api('/api/inventario/movimientos',{presentationId:presentation.id,type:'INGRESO',quantity:15,reason:marker});
  assert.equal(await stage(orders[0].id),'DISPONIBLE_PARA_PREPARAR');assert.equal(await stage(orders[1].id),'EN_PREPARACION');
  const coverage=await db.query('SELECT * FROM cobertura_pedidos WHERE pedido_id=ANY($1::uuid[])',[orders.map(x=>x.id)]);
  assert.equal(Number(coverage.rows.find(x=>x.pedido_id===orders[0].id).cubierto),10);assert.equal(Number(coverage.rows.find(x=>x.pedido_id===orders[1].id).cubierto),5);
  passed('WF-03','la fecha del pedido prevalece sobre orden de confirmación; no duplica cobertura');
  let blocked=await api('/api/preparations',{orderId:orders[1].id});
  blocked=await api(`/api/preparations/${blocked.id}/progress`,{details:[{preparationDetailId:blocked.details[0].id,preparedQuantity:5,verified:true,observation:'Falta cobertura'}]});
  await api(`/api/preparations/${blocked.id}/confirm`,{},'POST',422);passed('WF-04','no confirma preparación parcial ni salta prioridad');
  await api('/api/inventario/movimientos',{presentationId:presentation.id,type:'INGRESO',quantity:35,reason:marker});
  stock=(await api(`/api/inventario/existencias?productId=${product.id}`)).data[0];assert.equal(Number(stock.availableQuantity),0);
  for(const order of orders)assert.equal(await stage(order.id),'DISPONIBLE_PARA_PREPARAR');passed('WF-05','saldo cero con cobertura completa habilita todos los pedidos');
  const preparations=[];
  for(let i=0;i<5;i++){
    let prep=i===1?await api(`/api/preparations/${blocked.id}`):await api('/api/preparations',{orderId:orders[i].id});
    prep=await api(`/api/preparations/${prep.id}/progress`,{details:prep.details.map(d=>({preparationDetailId:d.id,preparedQuantity:10,verified:true}))});
    prep=await api(`/api/preparations/${prep.id}/confirm`,{});assert.equal(await stage(orders[i].id),'DISPONIBLE_PARA_PREPARAR');
    prep=await api(`/api/preparations/${prep.id}/handoff`,{});assert.equal(await stage(orders[i].id),'PREPARADO');preparations.push(prep);
  }
  assert.equal(Number((await api(`/api/inventario/existencias?productId=${product.id}`)).data[0].physicalQuantity),50);passed('WF-06','Preparado ocurre al traspasar a Distribución sin descontar stock');
  const vehicle=await api('/api/vehicles',{plate:`WF-${suffix}`,description:marker,capacityKg:1000});
  let route=await api('/api/distribution-routes',{date:deliveryDate,zoneId:zone.id,vehicleId:vehicle.id,responsibleIds:[driver.id],principalResponsibleId:driver.id,preparationIds:preparations.map(x=>x.id),observation:marker});
  for(const order of orders)assert.equal(await stage(order.id),'ASIGNADO');
  assert.equal(Number((await db.query(`SELECT count(*) FROM notificaciones WHERE pedido_id=ANY($1::uuid[]) AND evento='SALIDA_RUTA'`,[orders.map(x=>x.id)])).rows[0].count),0);passed('WF-07','asignar no anuncia que el vehículo salió');
  route=await api(`/api/distribution-routes/${route.id}/plan`,{});route=await api(`/api/distribution-routes/${route.id}/departure`,{});
  assert.equal((await publicState(tokens[3])).deliveryTurn,4);passed('WF-08','posición cuatro muestra turno cuatro al iniciar reparto');
  const visit=async(position,result,deliveredQuantity)=>{const d=route.deliveries.find(x=>x.position===position);await api(`/api/route-deliveries/${d.id}/result`,{result,observation:result==='ENTREGADA'?undefined:'Resolución de visita de aceptación',details:[{preparationDetailId:d.preparation.details[0].id,deliveredQuantity,returnedQuantity:10-deliveredQuantity}]});};
  await visit(5,'NO_ENTREGADA',0);assert.equal((await publicState(tokens[3])).deliveryTurn,4);passed('WF-09','resolver visita posterior no reduce el turno');
  await visit(1,'ENTREGADA',10);assert.equal((await publicState(tokens[3])).deliveryTurn,3);
  await visit(2,'ENTREGA_PARCIAL',5);assert.equal((await publicState(tokens[3])).deliveryTurn,2);assert.equal(await stage(orders[1].id),'ENTREGA_PARCIAL');
  await visit(3,'NO_ENTREGADA',0);assert.equal((await publicState(tokens[3])).deliveryTurn,1);passed('WF-10','visitas completas, parciales y fallidas actualizan 4→3→2→1');
  await visit(4,'ENTREGADA',10);const delivered=await publicState(tokens[3]);assert.equal(delivered.status,'ENTREGADO');assert.equal(delivered.deliveryTurn,null);
  for(const expected of ['BORRADOR','RECIBIDO','PEDIDO_CONFIRMADO','EN_PREPARACION','DISPONIBLE_PARA_PREPARAR','PREPARADO','ASIGNADO','EN_RUTA','ENTREGADO'])assert(delivered.history.some(x=>x.status===expected),`historial debe contener ${expected}`);
  const completedOrder=await api(`/api/pedidos/${orders[3].id}`);assert.equal(completedOrder.details[0].availability,'DESPACHADO');assert.equal(Number(completedOrder.details[0].shortageQuantity),0);
  passed('WF-11','historial completo desde borrador hasta entrega, sin mostrar faltantes iniciales después de despachar');
  const renewed=await api(`/api/orders/${orders[3].id}/tracking-link`,{expiresAt:new Date(Date.now()+86400000).toISOString()});const renewedToken=renewed.url.split('/').at(-1);
  assert((await publicState(renewedToken)).history.length>=delivered.history.length);await expectStatus(`/api/public/tracking/${tokens[3]}`,{},404,'enlace anterior revocado');passed('WF-12','renovar conserva historial y revoca acceso anterior');
  const request=await api(`/api/public/tracking/${renewedToken}/change-requests`,{message:'Solicito cambio de dos productos recibidos'});
  const duplicate=await api(`/api/public/tracking/${renewedToken}/change-requests`,{message:'Solicito cambio de dos productos recibidos'});assert.equal(duplicate.id,request.id);
  const staffRequests=await api('/api/order-change-requests');assert(staffRequests.some(x=>x.id===request.id));
  await api(`/api/order-change-requests/${request.id}/resolve`,{response:'Se coordinará el cambio con el cliente'});
  const resolved=await publicState(renewedToken);assert.equal(resolved.changeRequests[0].status,'RESUELTA');assert.equal(resolved.status,'ENTREGADO');passed('WF-13','solicitud y resolución trazables sin alterar entrega ni inventario');
  await api('/api/tracking-events',{orderId:orders[3].id,sourceEvent:`test.flush:${suffix}`});
  const sent=await db.query(`SELECT evento, cuerpo_renderizado FROM notificaciones WHERE pedido_id=$1`,[orders[3].id]);
  for(const event of ['PEDIDO_BORRADOR','PEDIDO_CONFIRMADO','SALIDA_RUTA','ENTREGADO'])assert.equal(sent.rows.filter(x=>x.evento===event).length,1,`mensaje único ${event}`);
  assert(sent.rows.find(x=>x.evento==='ENTREGADO').cuerpo_renderizado.includes('cambio de productos'));
  assert(sent.rows.every(x=>x.cuerpo_renderizado.includes('/seguimiento/')));passed('WF-14','cuatro mensajes principales únicos con enlace y opción de cambio');
  await api('/api/notification-event-settings',{event:'PEDIDO_BORRADOR',enabled:false});
  const silent=await api('/api/pedidos',{customerId:customer.id,addressId:address.id,requestedDate:deliveryDate,details:[{presentationId:presentation.id,quantity:1}],observations:marker});
  assert.equal(Number((await db.query('SELECT count(*) FROM notificaciones WHERE pedido_id=$1',[silent.id])).rows[0].count),0);
  assert.equal((await api(`/api/orders/${silent.id}/tracking-link`)).tracking.status,'BORRADOR');
  await api('/api/notification-templates/defaults',{});assert.equal((await api('/api/notification-event-settings')).find(x=>x.event==='PEDIDO_BORRADOR').enabled,false);passed('WF-15','check desactivado omite mensaje y conserva historial; plantillas no lo reactivan');
  assert.equal(Number((await db.query(`SELECT count(*) FROM notificaciones_intentos a JOIN notificaciones n ON n.id=a.notificacion_id WHERE n.pedido_id=ANY($1::uuid[])`,[orders.map(x=>x.id)])).rows[0].count),0);passed('WF-16','ningún WhatsApp real enviado durante la prueba');

  const create=async(details)=>api('/api/pedidos',{customerId:customer.id,addressId:address.id,requestedDate:deliveryDate,details,observations:marker});
  const approve=async(order)=>{await api(`/api/pedidos/${order.id}/enviar`,{});await api(`/api/pedidos/${order.id}/confirmar`,{});};
  const oldest=await create([{presentationId:presentation.id,quantity:10}]);
  const younger=await create([{presentationId:presentation.id,quantity:10}]);
  await api('/api/inventario/movimientos',{presentationId:presentation.id,type:'INGRESO',quantity:10,reason:marker});
  await approve(younger);
  let separated=await api('/api/preparations',{orderId:younger.id});
  separated=await api(`/api/preparations/${separated.id}/progress`,{details:[{preparationDetailId:separated.details[0].id,preparedQuantity:10,verified:true}]});
  await api(`/api/preparations/${separated.id}/confirm`,{});await approve(oldest);
  assert.equal(await stage(younger.id),'DISPONIBLE_PARA_PREPARAR');assert.equal(await stage(oldest.id),'EN_PREPARACION');
  passed('WF-17','una confirmación antigua tardía respeta el producto ya separado por Almacén');
  await api(`/api/preparations/${separated.id}/cancel`,{reason:'Liberar separación para validar prioridad'});
  assert.equal(await stage(oldest.id),'DISPONIBLE_PARA_PREPARAR');assert.equal(await stage(younger.id),'EN_PREPARACION');
  await api(`/api/pedidos/${oldest.id}/cancelar`,{reason:'Validar liberación de reserva'});
  assert.equal(await stage(younger.id),'DISPONIBLE_PARA_PREPARAR');passed('WF-18','cancelaciones de preparación y pedido redistribuyen cobertura sin perder historial');
  const secondPresentation=await api(`/api/productos/${product.id}/presentaciones`,{unitId:unit.id,description:'Segunda presentación',conversionFactor:2,weightKg:4});
  await api(`/api/presentaciones/${secondPresentation.id}/precios`,{customerType:'MINORISTA',amount:50,validFrom:isoDate(-1)});
  const multi=await create([{presentationId:presentation.id,quantity:1},{presentationId:secondPresentation.id,quantity:5}]);await approve(multi);
  await api('/api/inventario/movimientos',{presentationId:presentation.id,type:'INGRESO',quantity:1,reason:marker});
  assert.equal(await stage(multi.id),'EN_PREPARACION');
  await api('/api/inventario/movimientos',{presentationId:secondPresentation.id,type:'INGRESO',quantity:5,reason:marker});
  assert.equal(await stage(multi.id),'DISPONIBLE_PARA_PREPARAR');passed('WF-19','un pedido con varios productos solo cambia al cubrir todas sus líneas');

  // Enabling a previously disabled state must not deliver an old event retroactively.
  await api('/api/notification-event-settings',{event:'DISPONIBLE_PARA_PREPARAR',enabled:true});
  await api('/api/tracking-events',{orderId:multi.id,sourceEvent:`test.nonretro:${suffix}`});
  assert.equal(Number((await db.query("SELECT count(*) FROM notificaciones WHERE pedido_id=$1 AND evento='DISPONIBLE_PARA_PREPARAR'",[multi.id])).rows[0].count),0);
  passed('WF-20','activar un estado no envía retroactivamente cambios ocurridos con el check desmarcado');

  await api('/api/notification-event-settings',{event:'PREPARADO',enabled:true});
  let newPreparation=await api('/api/preparations',{orderId:younger.id});
  newPreparation=await api(`/api/preparations/${newPreparation.id}/progress`,{details:[{preparationDetailId:newPreparation.details[0].id,preparedQuantity:10,verified:true}]});
  await api(`/api/preparations/${newPreparation.id}/confirm`,{});await api(`/api/preparations/${newPreparation.id}/handoff`,{});
  await api('/api/tracking-events',{orderId:younger.id,sourceEvent:`test.prepared:${suffix}`});
  assert.equal(Number((await db.query("SELECT count(*) FROM notificaciones WHERE pedido_id=$1 AND evento='PREPARADO'",[younger.id])).rows[0].count),1);
  passed('WF-21','el check de Preparado habilita su mensaje específico al traspasar a Distribución');
  await api('/api/distribution-routes',{date:isoDate(16),zoneId:zone.id,vehicleId:vehicle.id,responsibleIds:[driver.id],principalResponsibleId:driver.id,preparationIds:[newPreparation.id],observation:marker});
  await api('/api/notification-event-settings',{event:'ASIGNADO',enabled:true});
  await api('/api/tracking-events',{orderId:younger.id,sourceEvent:`test.assigned.nonretro:${suffix}`});
  assert.equal(await stage(younger.id),'ASIGNADO');
  assert.equal(Number((await db.query("SELECT count(*) FROM notificaciones WHERE pedido_id=$1 AND evento='ASIGNADO'",[younger.id])).rows[0].count),0);
  passed('WF-22','Asignado conserva estado e historial sin mensaje si estaba desmarcado al asignar');
  console.log(`${results.length} comprobaciones del flujo unificado aprobadas.`);
} finally { await db.end(); }
