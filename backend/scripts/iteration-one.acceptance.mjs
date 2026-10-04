import assert from 'node:assert/strict';
import pg from 'pg';

const baseUrl = process.env.ACCEPTANCE_BASE_URL ?? 'http://frontend:8080';
const adminIdentifier = process.env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local';
const adminPassword = process.env.INITIAL_ADMIN_PASSWORD ?? 'Cambiar123!';
const suffix = Date.now().toString(36);

class CookieJar {
  values = new Map();

  absorb(headers) {
    const cookies = typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : headers.get('set-cookie') ? [headers.get('set-cookie')] : [];
    for (const cookie of cookies) {
      const pair = cookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
  }

  header() {
    return [...this.values].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  clone() {
    const copy = new CookieJar();
    copy.values = new Map(this.values);
    return copy;
  }
}

async function request(path, { method = 'GET', body, jar = new CookieJar() } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
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
  assert.equal(
    result.response.status,
    expected,
    `${label}: se esperaba HTTP ${expected}, se recibió ${result.response.status}: ${JSON.stringify(result.payload)}`,
  );
  return result;
}

const results = [];
function passed(code, description) {
  results.push({ code, description });
  process.stdout.write(`✓ ${code} ${description}\n`);
}

async function cleanupAcceptanceData() {
  if (!process.env.DATABASE_HOST || process.env.ACCEPTANCE_KEEP_DATA === 'true') return;
  const client = new pg.Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
  });
  await client.connect();
  try {
    await client.query('BEGIN');
    const users = await client.query(
      'SELECT id FROM usuarios WHERE email = ANY($1::text[])',
      [[
        `inactivo.${suffix}@icar.local`,
        `lector.${suffix}@icar.local`,
        `ventas.${suffix}@icar.local`,
        `cliente.${suffix}@icar.local`,
      ]],
    );
    const userIds = users.rows.map((row) => row.id);
    const roles = await client.query(
      'SELECT id FROM roles WHERE name = $1',
      [`LECTOR_CLIENTES_${suffix.toUpperCase()}`],
    );
    const roleIds = roles.rows.map((row) => row.id);
    const customers = await client.query(
      'SELECT id FROM clientes WHERE nombre_razon_social = ANY($1::text[])',
      [[`Cliente Aceptación A ${suffix}`, `Cliente Aceptación B ${suffix}`]],
    );
    const customerIds = customers.rows.map((row) => row.id);
    const zones = await client.query(
      'SELECT id FROM zonas WHERE nombre = $1',
      [`Zona Aceptación ${suffix}`],
    );
    const zoneIds = zones.rows.map((row) => row.id);

    await client.query(
      `DELETE FROM eventos_auditoria
       WHERE usuario_id = ANY($1::uuid[])
          OR entidad_id = ANY($2::text[])
          OR metadatos->>'customerId' = ANY($3::text[])`,
      [userIds, [...userIds, ...roleIds, ...customerIds, ...zoneIds], customerIds],
    );
    await client.query(
      'DELETE FROM domicilios_cliente WHERE cliente_id = ANY($1::uuid[])',
      [customerIds],
    );
    await client.query('DELETE FROM clientes WHERE id = ANY($1::uuid[])', [customerIds]);
    await client.query(
      'DELETE FROM dias_distribucion WHERE zona_id = ANY($1::uuid[])',
      [zoneIds],
    );
    await client.query('DELETE FROM zonas WHERE id = ANY($1::uuid[])', [zoneIds]);
    await client.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [userIds]);
    await client.query('DELETE FROM roles WHERE id = ANY($1::uuid[])', [roleIds]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

try {
  const adminJar = new CookieJar();
  const validLogin = await expectStatus('/api/auth/login', {
    method: 'POST',
    jar: adminJar,
    body: { identifier: adminIdentifier, password: adminPassword },
  }, 200, 'CP-01');
  assert.equal(validLogin.payload.user.email, adminIdentifier.toLowerCase());
  assert(adminJar.values.has('icar_access'));
  passed('CP-01', 'la cuenta interna activa inicia una sesión válida');

  const invalidJar = new CookieJar();
  const invalidLogin = await expectStatus('/api/auth/login', {
    method: 'POST',
    jar: invalidJar,
    body: { identifier: adminIdentifier, password: 'Credencial-Incorrecta-987!' },
  }, 401, 'CP-02');
  assert.match(String(invalidLogin.payload.message), /Credenciales inválidas|cuenta no disponible/i);
  assert(!invalidJar.values.has('icar_access'));
  passed('CP-02', 'las credenciales inválidas no revelan el dato incorrecto');

  const rolesResponse = await expectStatus('/api/roles', { jar: adminJar }, 200, 'roles');
  const permissionsResponse = await expectStatus('/api/permissions', { jar: adminJar }, 200, 'permisos');
  const customerRead = permissionsResponse.payload.find((permission) => permission.key === 'customers.read');
  assert(customerRead, 'No existe customers.read');

  const inactiveUser = await expectStatus('/api/usuarios', {
    method: 'POST',
    jar: adminJar,
    body: {
      name: 'Usuario Inactivo',
      username: `inactivo.${suffix}`,
      email: `inactivo.${suffix}@icar.local`,
      password: 'Segura1234!',
      roleIds: [rolesResponse.payload.find((role) => role.name === 'COMERCIALIZACION').id],
    },
  }, 201, 'crear usuario inactivo');
  await expectStatus(`/api/usuarios/${inactiveUser.payload.id}`, {
    method: 'PATCH', jar: adminJar, body: { status: 'INACTIVO' },
  }, 200, 'inactivar usuario');
  await expectStatus('/api/auth/login', {
    method: 'POST',
    body: { identifier: inactiveUser.payload.email, password: 'Segura1234!' },
  }, 401, 'CP-03');
  passed('CP-03', 'una cuenta inactiva no puede autenticarse');

  const zone = await expectStatus('/api/zonas', {
    method: 'POST', jar: adminJar,
    body: { name: `Zona Aceptación ${suffix}`, description: 'Zona temporal' },
  }, 201, 'crear zona');
  const day = await expectStatus(`/api/zonas/${zone.payload.id}/dias-distribucion`, {
    method: 'POST', jar: adminJar,
    body: { weekday: 3, startTime: '08:00', endTime: '12:00' },
  }, 201, 'crear día');

  const customerA = await expectStatus('/api/clientes', {
    method: 'POST', jar: adminJar,
    body: {
      type: 'DISTRIBUIDOR',
      businessName: `Cliente Aceptación A ${suffix}`,
      taxId: `ACEPT-A-${suffix}`,
      contactName: 'Contacto A',
      phone: `71${suffix.slice(-6).padStart(6, '0')}`,
      whatsapp: `71${suffix.slice(-6).padStart(6, '0')}`,
      email: `contacto.a.${suffix}@example.test`,
      paymentCondition: 'CREDITO',
      creditLimit: 5000,
      creditDays: 15,
    },
  }, 201, 'crear cliente A');
  const customerB = await expectStatus('/api/clientes', {
    method: 'POST', jar: adminJar,
    body: {
      type: 'MINORISTA',
      businessName: `Cliente Aceptación B ${suffix}`,
      taxId: `ACEPT-B-${suffix}`,
      phone: `72${suffix.slice(-6).padStart(6, '0')}`,
      paymentCondition: 'CONTADO',
      creditLimit: 0,
      creditDays: 0,
    },
  }, 201, 'crear cliente B');

  const customerAccount = await expectStatus(`/api/clientes/${customerA.payload.id}/usuarios`, {
    method: 'POST', jar: adminJar,
    body: {
      name: 'Cuenta Cliente A',
      username: `cliente.${suffix}`,
      email: `cliente.${suffix}@icar.local`,
      password: 'Cliente1234!',
      phone: '70000001',
      isPrimary: true,
    },
  }, 201, 'crear cuenta de cliente');
  assert.equal(customerAccount.payload.customerId, customerA.payload.id);

  const customerJar = new CookieJar();
  const customerLogin = await expectStatus('/api/auth/login', {
    method: 'POST', jar: customerJar,
    body: { identifier: `cliente.${suffix}@icar.local`, password: 'Cliente1234!' },
  }, 200, 'CP-04');
  assert.equal(customerLogin.payload.user.type, 'CLIENTE');
  assert.equal(customerLogin.payload.user.customerId, customerA.payload.id);
  const profile = await expectStatus('/api/me', { jar: customerJar }, 200, 'perfil cliente');
  assert.equal(profile.payload.customerId, customerA.payload.id);
  passed('CP-04', 'la cuenta de cliente identifica y conserva su vínculo comercial');

  await expectStatus(`/api/clientes/${customerA.payload.id}`, { jar: customerJar }, 200, 'cliente propio');
  await expectStatus(`/api/clientes/${customerB.payload.id}`, { jar: customerJar }, 404, 'CP-05');
  const scopedList = await expectStatus('/api/clientes?page=1&limit=20', { jar: customerJar }, 200, 'lista acotada');
  assert.equal(scopedList.payload.data.length, 1);
  assert.equal(scopedList.payload.data[0].id, customerA.payload.id);
  passed('CP-05', 'el cliente no puede consultar registros de otro cliente');

  const restrictedRole = await expectStatus('/api/roles', {
    method: 'POST', jar: adminJar,
    body: {
      name: `LECTOR_CLIENTES_${suffix}`,
      description: 'Rol temporal de aceptación',
      permissionIds: [customerRead.id],
    },
  }, 201, 'crear rol restringido');
  const restrictedUser = await expectStatus('/api/usuarios', {
    method: 'POST', jar: adminJar,
    body: {
      name: 'Usuario Restringido',
      username: `lector.${suffix}`,
      email: `lector.${suffix}@icar.local`,
      password: 'Segura1234!',
      roleIds: [restrictedRole.payload.id],
    },
  }, 201, 'crear usuario restringido');
  const restrictedJar = new CookieJar();
  await expectStatus('/api/auth/login', {
    method: 'POST', jar: restrictedJar,
    body: { identifier: restrictedUser.payload.email, password: 'Segura1234!' },
  }, 200, 'login restringido');
  await expectStatus('/api/clientes', {
    method: 'POST', jar: restrictedJar,
    body: {
      type: 'MINORISTA', businessName: `No permitido ${suffix}`, phone: '70000000',
      paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0,
    },
  }, 403, 'CP-06');
  passed('CP-06', 'la API responde 403 y no ejecuta una operación sin permiso');

  const salesUser = await expectStatus('/api/usuarios', {
    method: 'POST', jar: adminJar,
    body: {
      name: 'Usuario Ventas',
      username: `ventas.${suffix}`,
      email: `ventas.${suffix}@icar.local`,
      password: 'Segura1234!',
      roleIds: [rolesResponse.payload.find((role) => role.name === 'COMERCIALIZACION').id],
    },
  }, 201, 'crear usuario ventas');
  const salesJar = new CookieJar();
  await expectStatus('/api/auth/login', {
    method: 'POST', jar: salesJar,
    body: { identifier: salesUser.payload.email, password: 'Segura1234!' },
  }, 200, 'login ventas');
  const salesCustomers = await expectStatus('/api/clientes?page=1&limit=20', { jar: salesJar }, 200, 'CP-07');
  assert(salesCustomers.payload.data.some((customer) => customer.id === customerA.payload.id));
  passed('CP-07', 'Ventas consulta los clientes autorizados por su rol');

  const customerAudit = await expectStatus(
    `/api/auditoria?page=1&limit=20&action=CREAR_CLIENTE&entityId=${customerA.payload.id}`,
    { jar: adminJar }, 200, 'CP-08',
  );
  assert(customerAudit.payload.data.length >= 1);
  assert.equal(customerAudit.payload.data[0].userId, validLogin.payload.user.id);
  passed('CP-08', 'el alta de cliente genera su evento de auditoría');

  await expectStatus('/api/clientes', {
    method: 'POST', jar: adminJar,
    body: {
      type: 'DISTRIBUIDOR', businessName: `Duplicado ${suffix}`,
      taxId: `ACEPT-A-${suffix}`, phone: '70000009',
      paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0,
    },
  }, 409, 'CP-09');
  passed('CP-09', 'la identificación única duplicada se rechaza con un mensaje controlado');

  const beforeAddresses = await expectStatus(
    `/api/clientes/${customerA.payload.id}/domicilios`, { jar: adminJar }, 200, 'domicilios antes',
  );
  await expectStatus(`/api/clientes/${customerA.payload.id}/domicilios`, {
    method: 'POST', jar: adminJar,
    body: {
      label: 'Inválido', address: 'Dirección fuera de rango', latitude: -91, longitude: -68,
      zoneId: zone.payload.id, distributionDayId: day.payload.id,
    },
  }, 400, 'CP-10');
  const afterInvalid = await expectStatus(
    `/api/clientes/${customerA.payload.id}/domicilios`, { jar: adminJar }, 200, 'domicilios después',
  );
  assert.equal(afterInvalid.payload.length, beforeAddresses.payload.length);
  passed('CP-10', 'las coordenadas fuera de rango no alteran los datos persistidos');

  const address = await expectStatus(`/api/clientes/${customerA.payload.id}/domicilios`, {
    method: 'POST', jar: adminJar,
    body: {
      label: 'Principal', address: 'Avenida Arce 1234, La Paz', reference: 'Frente a la plaza',
      latitude: -16.509212, longitude: -68.126711,
      zoneId: zone.payload.id, distributionDayId: day.payload.id, isPrimary: true,
    },
  }, 201, 'CP-11');
  assert.equal(address.payload.zone.id, zone.payload.id);
  assert.equal(address.payload.distributionDay.id, day.payload.id);
  passed('CP-11', 'la zona activa conserva y expone su día programado');

  await expectStatus(`/api/clientes/${customerA.payload.id}`, {
    method: 'PATCH', jar: adminJar, body: { contactName: 'Contacto Actualizado' },
  }, 200, 'actualizar cliente');
  const from = encodeURIComponent(new Date(Date.now() - 60_000).toISOString());
  const audit = await expectStatus(
    `/api/auditoria?page=1&limit=20&userId=${validLogin.payload.user.id}&action=ACTUALIZAR_CLIENTE&entity=clientes&result=EXITOSO&from=${from}`,
    { jar: adminJar }, 200, 'CP-12',
  );
  assert(audit.payload.data.length >= 1);
  const updateEvent = audit.payload.data[0];
  assert.equal(updateEvent.entityId, customerA.payload.id);
  assert(updateEvent.occurredAt);
  assert(!/password|token|secret/i.test(JSON.stringify(updateEvent.metadata)));
  passed('CP-12', 'la consulta de auditoría filtra y conserva eventos sin secretos');

  const previousSession = adminJar.clone();
  await expectStatus('/api/auth/logout', { method: 'POST', jar: adminJar, body: {} }, 200, 'logout');
  await expectStatus('/api/auth/me', { jar: previousSession }, 401, 'sesión revocada');
  passed('HU-01', 'el cierre invalida la sesión renovable en el servidor');

  process.stdout.write(`\n${results.length} comprobaciones de aceptación superadas.\n`);
} finally {
  await cleanupAcceptanceData();
  process.stdout.write('Datos temporales de aceptación eliminados.\n');
}
