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
      : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
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
    await client.query(`
      BEGIN;
      CREATE TEMP TABLE qa_users ON COMMIT DROP AS
        SELECT id FROM usuarios
        WHERE email IN ('lector.${suffix}@icar.local', 'inactivo.${suffix}@icar.local');
      CREATE TEMP TABLE qa_roles ON COMMIT DROP AS
        SELECT id FROM roles WHERE name = 'LECTOR_CLIENTES_${suffix.toUpperCase()}';
      CREATE TEMP TABLE qa_customers ON COMMIT DROP AS
        SELECT id FROM clientes WHERE nombre_razon_social = 'Cliente Aceptación ${suffix}';
      CREATE TEMP TABLE qa_addresses ON COMMIT DROP AS
        SELECT id FROM domicilios_cliente WHERE cliente_id IN (SELECT id FROM qa_customers);
      CREATE TEMP TABLE qa_zones ON COMMIT DROP AS
        SELECT id FROM zonas WHERE nombre = 'Zona Aceptación ${suffix}';
      CREATE TEMP TABLE qa_days ON COMMIT DROP AS
        SELECT id FROM dias_distribucion WHERE zona_id IN (SELECT id FROM qa_zones);
      DELETE FROM eventos_auditoria
      WHERE usuario_id IN (SELECT id FROM qa_users)
        OR entidad_id IN (SELECT id::text FROM qa_users)
        OR entidad_id IN (SELECT id::text FROM qa_roles)
        OR entidad_id IN (SELECT id::text FROM qa_customers)
        OR entidad_id IN (SELECT id::text FROM qa_addresses)
        OR entidad_id IN (SELECT id::text FROM qa_zones)
        OR entidad_id IN (SELECT id::text FROM qa_days);
      DELETE FROM domicilios_cliente WHERE id IN (SELECT id FROM qa_addresses);
      DELETE FROM clientes WHERE id IN (SELECT id FROM qa_customers);
      DELETE FROM dias_distribucion WHERE id IN (SELECT id FROM qa_days);
      DELETE FROM zonas WHERE id IN (SELECT id FROM qa_zones);
      DELETE FROM usuarios WHERE id IN (SELECT id FROM qa_users);
      DELETE FROM roles WHERE id IN (SELECT id FROM qa_roles);
      COMMIT;
    `);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

const adminJar = new CookieJar();
const validLogin = await expectStatus('/api/auth/login', {
  method: 'POST',
  jar: adminJar,
  body: { identifier: adminIdentifier, password: adminPassword },
}, 200, 'CP01');
assert.equal(validLogin.payload.user.email, adminIdentifier.toLowerCase());
assert(adminJar.values.has('icar_access'));
passed('CP01', 'inicio de sesión válido y acceso concedido');

const invalidJar = new CookieJar();
const invalidLogin = await expectStatus('/api/auth/login', {
  method: 'POST',
  jar: invalidJar,
  body: { identifier: adminIdentifier, password: 'Credencial-Incorrecta-987!' },
}, 401, 'CP02');
assert.match(String(invalidLogin.payload.message), /Credenciales inválidas|cuenta no disponible/i);
assert(!invalidJar.values.has('icar_access'));
passed('CP02', 'credenciales inválidas devuelven mensaje genérico y ningún token');

const rolesResponse = await expectStatus('/api/roles', { jar: adminJar }, 200, 'roles');
const permissionsResponse = await expectStatus('/api/permissions', { jar: adminJar }, 200, 'permissions');
const customerRead = permissionsResponse.payload.find((permission) => permission.key === 'customers.read');
assert(customerRead, 'No existe customers.read');

const restrictedRole = await expectStatus('/api/roles', {
  method: 'POST',
  jar: adminJar,
  body: {
    name: `LECTOR_CLIENTES_${suffix}`,
    description: 'Rol temporal de aceptación',
    permissionIds: [customerRead.id],
  },
}, 201, 'crear rol restringido');

const restrictedUser = await expectStatus('/api/users', {
  method: 'POST',
  jar: adminJar,
  body: {
    name: 'Usuario Restringido',
    username: `lector.${suffix}`,
    email: `lector.${suffix}@icar.local`,
    password: 'Segura1234!',
    roleIds: [restrictedRole.payload.id],
  },
}, 201, 'crear usuario restringido');

const inactiveUser = await expectStatus('/api/users', {
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
await expectStatus(`/api/users/${inactiveUser.payload.id}`, {
  method: 'PATCH',
  jar: adminJar,
  body: { status: 'INACTIVO' },
}, 200, 'inactivar usuario');
await expectStatus('/api/auth/login', {
  method: 'POST',
  body: { identifier: inactiveUser.payload.email, password: 'Segura1234!' },
}, 401, 'CP03');
passed('CP03', 'usuario inactivo no puede autenticarse');

const restrictedJar = new CookieJar();
await expectStatus('/api/auth/login', {
  method: 'POST',
  jar: restrictedJar,
  body: { identifier: restrictedUser.payload.email, password: 'Segura1234!' },
}, 200, 'login usuario restringido');
await expectStatus('/api/customers', {
  method: 'POST',
  jar: restrictedJar,
  body: {
    type: 'MINORISTA', businessName: `No permitido ${suffix}`, phone: '70000000',
    paymentCondition: 'CONTADO', creditLimit: 0, creditDays: 0,
  },
}, 403, 'CP04');
await expectStatus('/api/customers?page=1&limit=1', { jar: restrictedJar }, 200, 'lectura permitida');
passed('CP04', 'permiso faltante produce 403 y bloquea la creación');

const zone = await expectStatus('/api/zones', {
  method: 'POST',
  jar: adminJar,
  body: { name: `Zona Aceptación ${suffix}`, description: 'Zona temporal CP07' },
}, 201, 'crear zona');
const day = await expectStatus(`/api/zones/${zone.payload.id}/distribution-days`, {
  method: 'POST',
  jar: adminJar,
  body: { weekday: 3, startTime: '08:00', endTime: '12:00' },
}, 201, 'crear día');
await expectStatus(`/api/zones/${zone.payload.id}`, {
  method: 'PATCH',
  jar: adminJar,
  body: { description: 'Zona temporal CP07 verificada' },
}, 200, 'editar zona con calendario');

const customer = await expectStatus('/api/customers', {
  method: 'POST',
  jar: adminJar,
  body: {
    type: 'DISTRIBUIDOR',
    businessName: `Cliente Aceptación ${suffix}`,
    taxId: `ACEPT-${suffix}`,
    contactName: 'Contacto Aceptación',
    phone: `71${suffix.slice(-6).padStart(6, '0')}`,
    whatsapp: `71${suffix.slice(-6).padStart(6, '0')}`,
    email: `cliente.${suffix}@example.test`,
    paymentCondition: 'CREDITO',
    creditLimit: 5000,
    creditDays: 15,
  },
}, 201, 'CP05');
assert.equal(customer.payload.type, 'DISTRIBUIDOR');
assert.equal(customer.payload.paymentCondition, 'CREDITO');
passed('CP05', 'cliente válido registrado con sus condiciones comerciales');

const beforeAddresses = await expectStatus(`/api/customers/${customer.payload.id}/addresses`, { jar: adminJar }, 200, 'domicilios antes');
await expectStatus(`/api/customers/${customer.payload.id}/addresses`, {
  method: 'POST',
  jar: adminJar,
  body: {
    label: 'Inválido', address: 'Dirección fuera de rango', latitude: -91, longitude: -68,
    zoneId: zone.payload.id, distributionDayId: day.payload.id,
  },
}, 400, 'CP06');
const afterInvalid = await expectStatus(`/api/customers/${customer.payload.id}/addresses`, { jar: adminJar }, 200, 'domicilios después');
assert.equal(afterInvalid.payload.length, beforeAddresses.payload.length);
passed('CP06', 'coordenadas fuera de rango son rechazadas sin persistencia');

const address = await expectStatus(`/api/customers/${customer.payload.id}/addresses`, {
  method: 'POST',
  jar: adminJar,
  body: {
    label: 'Principal',
    address: 'Avenida Arce 1234, La Paz',
    reference: 'Frente a la plaza',
    latitude: -16.509212,
    longitude: -68.126711,
    zoneId: zone.payload.id,
    distributionDayId: day.payload.id,
    isPrimary: true,
  },
}, 201, 'CP07');
assert.equal(address.payload.zone.id, zone.payload.id);
assert.equal(address.payload.distributionDay.id, day.payload.id);
passed('CP07', 'domicilio relacionado con zona, día y coordenadas válidas');

await expectStatus(`/api/customers/${customer.payload.id}`, {
  method: 'PATCH',
  jar: adminJar,
  body: { contactName: 'Contacto Actualizado' },
}, 200, 'actualizar cliente');
const audit = await expectStatus(`/api/audit-events?page=1&limit=20&action=ACTUALIZAR_CLIENTE&entityId=${customer.payload.id}`, { jar: adminJar }, 200, 'CP08');
assert(audit.payload.data.length >= 1);
const updateEvent = audit.payload.data[0];
assert.equal(updateEvent.userId, validLogin.payload.user.id);
assert.equal(updateEvent.entityId, customer.payload.id);
assert(updateEvent.occurredAt);
assert(!/password|token|secret/i.test(JSON.stringify(updateEvent.metadata)));
passed('CP08', 'actualización auditable con actor, fecha, acción y referencia sin secretos');

const previousSession = adminJar.clone();
await expectStatus('/api/auth/logout', { method: 'POST', jar: adminJar, body: {} }, 200, 'logout');
await expectStatus('/api/auth/me', { jar: previousSession }, 401, 'sesión revocada');
passed('HU01', 'cierre de sesión invalida la sesión en servidor');

process.stdout.write(`\n${results.length} comprobaciones de aceptación superadas.\n`);
await cleanupAcceptanceData();
process.stdout.write('Datos temporales de aceptación eliminados.\n');
