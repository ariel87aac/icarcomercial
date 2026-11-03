import { Client } from 'pg';
import { hash } from 'bcryptjs';
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class RecoveryError extends Error {}

export function recoverySettings(env, args = []) {
  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new RecoveryError('El seed solo admite NODE_ENV=development o test. No se ejecuta en producción.');
  }
  if (args.length && (args.length !== 2 || args[0] !== '--user-id' || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(args[1]))) {
    throw new RecoveryError('Uso: npm run seed:admin [-- --user-id UUID]');
  }
  const username = (env.INITIAL_ADMIN_USERNAME ?? 'admin').trim().toLowerCase();
  const email = (env.INITIAL_ADMIN_EMAIL ?? 'admin@icar.local').trim().toLowerCase();
  const password = env.INITIAL_ADMIN_PASSWORD;
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new RecoveryError('INITIAL_ADMIN_USERNAME no es válido (3–80 caracteres).');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) throw new RecoveryError('INITIAL_ADMIN_EMAIL no es válido.');
  if (!password || password.length < 6 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new RecoveryError('Defina INITIAL_ADMIN_PASSWORD: mínimo 6 caracteres y máximo 72 bytes para bcrypt.');
  }
  return { username, email, password, userId: args[1]?.toLowerCase() ?? null };
}

// Requires a dedicated, connected client; all changes commit together or roll back.
export async function recoverAdmin(client, settings) {
  const passwordHash = await hash(settings.password, 12);
  await client.query('BEGIN');
  try {
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query('LOCK TABLE usuarios IN SHARE ROW EXCLUSIVE MODE');
    const matches = (await client.query(
      `SELECT id, tipo_usuario FROM usuarios
       WHERE lower(nombre_usuario) = $1 OR lower(email) = $2 OR id = $3::uuid FOR UPDATE`,
      [settings.username, settings.email, settings.userId],
    )).rows;
    if (matches.length > 1) throw new RecoveryError('El usuario, correo o ID corresponden a cuentas distintas. Resuelva la colisión antes de recuperar.');
    const existing = matches[0];
    if (settings.userId && existing?.id !== settings.userId) throw new RecoveryError('El ID solicitado no existe o la identidad predeterminada pertenece a otra cuenta.');
    if (existing && existing.tipo_usuario !== 'INTERNO') throw new RecoveryError('No se puede convertir una cuenta de cliente en administrador.');
    const role = (await client.query("SELECT id FROM roles WHERE name = 'ADMINISTRADOR' FOR UPDATE")).rows[0];
    if (!role) throw new RecoveryError('No existe el rol ADMINISTRADOR. Ejecute las migraciones antes de recuperar el usuario.');
    let user;
    if (existing) {
      user = (await client.query(
        `UPDATE usuarios SET nombre = 'Administrador ICAR', nombre_usuario = $2, email = $3,
         password_hash = $4, status = 'ACTIVO', debe_cambiar_password = false, updated_at = now()
         WHERE id = $1 RETURNING id, codigo, nombre_usuario`,
        [existing.id, settings.username, settings.email, passwordHash],
      )).rows[0];
    } else {
      user = (await client.query(
        `INSERT INTO usuarios (nombre, nombre_usuario, email, password_hash, tipo_usuario, status, debe_cambiar_password)
         VALUES ('Administrador ICAR', $1, $2, $3, 'INTERNO', 'ACTIVO', false) RETURNING id, codigo, nombre_usuario`,
        [settings.username, settings.email, passwordHash],
      )).rows[0];
    }
    await client.query("UPDATE roles SET status = 'ACTIVO', updated_at = now() WHERE id = $1", [role.id]);
    await client.query('INSERT INTO usuarios_roles (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, role.id]);
    await client.query('INSERT INTO roles_permisos (rol_id, permiso_id) SELECT $1, id FROM permisos ON CONFLICT DO NOTHING', [role.id]);
    const sessions = await client.query('UPDATE sesiones_usuario SET revocada_at = now(), updated_at = now() WHERE usuario_id = $1 AND revocada_at IS NULL', [user.id]);
    await client.query('UPDATE tokens_recuperacion SET usado_at = now(), updated_at = now() WHERE usuario_id = $1 AND usado_at IS NULL', [user.id]);
    await client.query(
      `INSERT INTO eventos_auditoria (usuario_id, modulo, accion, entidad, entidad_id, resultado, metadatos)
       VALUES ($1::uuid, 'users', 'RECUPERAR_ADMIN_DESARROLLO', 'usuarios', $1::text, 'EXITOSO', $2::jsonb)`,
      [user.id, JSON.stringify({ created: !existing, source: 'seed:admin', revokedSessions: sessions.rowCount })],
    );
    await client.query('COMMIT');
    return { id: user.id, username: user.nombre_usuario, created: !existing, revokedSessions: sessions.rowCount };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  config({ path: [path.join(backend, '.env'), path.join(backend, '..', '.env')], quiet: true });
  const settings = recoverySettings(process.env, process.argv.slice(2));
  const database = process.env.DATABASE_NAME ?? process.env.POSTGRES_DB;
  const user = process.env.DATABASE_USER ?? process.env.POSTGRES_USER;
  const password = process.env.DATABASE_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  if (!database || !user || !password) throw new RecoveryError('Defina DATABASE_NAME/USER/PASSWORD o POSTGRES_DB/USER/PASSWORD.');
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost', port: Number(process.env.DATABASE_PORT ?? 5432),
    database, user, password, connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false,
  });
  try {
    await client.connect();
    const result = await recoverAdmin(client, settings);
    console.log(`Administrador ${result.created ? 'creado' : 'restablecido'}: ${result.username} (${result.id}). Sesiones revocadas: ${result.revokedSessions}.`);
    console.log('Acceda con la contraseña configurada en INITIAL_ADMIN_PASSWORD.');
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof RecoveryError ? error.message : `No se pudo recuperar el administrador (${error.code ?? 'error de conexión o ejecución'}). Revise conexión y migraciones.`);
    process.exitCode = 1;
  });
}
