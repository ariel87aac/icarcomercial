import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.dirname(backend);
const runId = `icar-acceptance-${Date.now()}-${process.pid}`;
const database = `${runId}-db`, api = `${runId}-api`;
const image = process.env.ACCEPTANCE_BACKEND_IMAGE ?? 'icar-sistema-comercial-backend:latest';
const databaseImage = process.env.ACCEPTANCE_DATABASE_IMAGE ?? 'icar-sistema-comercial-database:latest';
const suites = process.argv.slice(2);
const allowed = new Map([
  ['orders', 'iteration-two.acceptance.mjs'],
  ['workflow', 'order-workflow.acceptance.mjs'],
  ['admin-recovery', 'recover-admin.acceptance.mjs'],
  ['production', 'iteration-three.acceptance.mjs'],
  ['production-plant', 'production-plant.acceptance.mjs'],
  ['production-scope', 'production-tracking-scope.acceptance.mjs'],
  ['stock-requests', 'stock-replenishment.acceptance.mjs'],
]);
if (!suites.length) suites.push('orders');
assert.equal(suites.length, 1, 'Ejecutar una suite por entorno para evitar datos compartidos entre suites');
for (const suite of suites) assert(allowed.has(suite), `Suite desconocida: ${suite}`);
const output = path.join(root, 'output', 'acceptance', runId);
await mkdir(output, { recursive: true });
const staging = await mkdtemp(path.join(tmpdir(), 'icar-acceptance-'));
let networkCreated = false;
const containers = [];

async function run(command, args, { quiet = false, tolerateFailure = false, timeoutMs = 300_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; if (!quiet) process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { text += chunk; if (!quiet) process.stderr.write(chunk); });
    child.on('error', (error) => { clearTimeout(timeout); reject(error); });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      const code = exitCode ?? 1;
      if (code && !tolerateFailure) reject(Object.assign(new Error(`${command} terminó con código ${code}`), { output: text }));
      else resolve({ code, text });
    });
  });
}
const docker = (args, options) => run('docker', args, options);
const env = {
  NODE_ENV: 'test', PORT: '3000', DATABASE_HOST: 'database', DATABASE_PORT: '5432',
  DATABASE_NAME: suites[0] === 'production-scope' ? 'icar_production_tracking_validation' : 'icar_workflow_validation', DATABASE_USER: 'icar_acceptance', DATABASE_PASSWORD: 'AcceptanceDbOnly123!',
  DATABASE_SSL: 'false', JWT_SECRET: 'isolated-acceptance-jwt-secret-32-characters',
  INITIAL_ADMIN_EMAIL: 'admin@icar.local', INITIAL_ADMIN_USERNAME: 'admin', INITIAL_ADMIN_PASSWORD: 'AcceptanceAdmin123!',
  CORS_ORIGIN: 'http://127.0.0.1:3000', PUBLIC_APP_URL: 'http://127.0.0.1:3000',
  NOTIFICATION_WORKER_ENABLED: 'false', PUBLIC_TRACKING_RATE_LIMIT: '10000',
  CHANNEL_CREDENTIALS_KEY: 'isolated-acceptance-channel-key-only',
  ACCEPTANCE_BASE_URL: 'http://127.0.0.1:3000', ACCEPTANCE_KEEP_DATA: 'true',
};
const environmentArgs = Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
async function waitFor(label, probe) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (await probe()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`No inició ${label} dentro de 90 segundos`);
}

try {
  console.log(`Aceptación aislada: ${runId}`);
  // Validate runtime dependencies before reusing the local image; source is always freshly compiled.
  const runtime = await docker(['run', '--rm', '--network', 'none', '--entrypoint', 'node', image,
    '-e', 'console.log(JSON.stringify(require("/app/package.json").dependencies))'], { quiet: true });
  const manifest = JSON.parse(await readFile(path.join(backend, 'package.json'), 'utf8'));
  assert.deepEqual(JSON.parse(runtime.text.trim()), manifest.dependencies,
    'La imagen backend no coincide con las dependencias actuales. Reconstruirla antes de ejecutar aceptación.');
  const config = path.join(staging, 'tsconfig.json');
  await writeFile(config, JSON.stringify({
    extends: path.join(backend, 'tsconfig.build.json'),
    compilerOptions: { outDir: path.join(staging, 'dist'), incremental: false },
    include: [path.join(backend, 'src/**/*.ts')],
    exclude: [path.join(backend, 'node_modules'), path.join(backend, 'src/**/*.spec.ts'),
      path.join(backend, 'src/base-datos/migraciones/*.local.ts')],
  }));
  await run(process.execPath, ['node_modules/typescript/bin/tsc', '-p', config]);
  await docker(['network', 'create', '--internal', runId], { quiet: true });
  networkCreated = true;
  containers.push(database);
  await docker(['run', '-d', '--name', database, '--network', runId, '--network-alias', 'database',
    '--mount', `type=bind,src=${path.join(root, 'database', 'init')},dst=/docker-entrypoint-initdb.d,readonly`,
    '--tmpfs', '/var/lib/postgresql:rw', '-e', `POSTGRES_DB=${env.DATABASE_NAME}`,
    '-e', `POSTGRES_USER=${env.DATABASE_USER}`, '-e', `POSTGRES_PASSWORD=${env.DATABASE_PASSWORD}`,
    databaseImage, 'postgres', '-c', 'jit=off'], { quiet: true });
  await waitFor('PostgreSQL', async () => (await docker(['exec', database, 'pg_isready', '-U', env.DATABASE_USER,
    '-d', env.DATABASE_NAME], { quiet: true, tolerateFailure: true })).code === 0);
  containers.push(api);
  await docker(['run', '-d', '--name', api, '--network', runId, ...environmentArgs,
    '--mount', `type=bind,src=${path.join(staging, 'dist')},dst=/app/dist,readonly`,
    '--mount', `type=bind,src=${path.join(backend, 'scripts')},dst=/app/scripts,readonly`, image], { quiet: true });
  await waitFor('API y migraciones', async () => {
    const state = await docker(['inspect', '--format', '{{.State.Running}}', api], { quiet: true });
    if (state.text.trim() !== 'true') throw new Error('El contenedor API terminó durante el arranque; consultar backend.log');
    return (await docker(['exec', api, 'node', '-e',
    'fetch("http://127.0.0.1:3000/api/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'],
    { quiet: true, tolerateFailure: true })).code === 0;
  });
  for (const suite of suites) {
    console.log(`Ejecutando ${suite}...`);
    const result = await docker(['exec', api, 'node', `scripts/${allowed.get(suite)}`], { tolerateFailure: true });
    await writeFile(path.join(output, `${suite}.log`), result.text);
    if (result.code) throw new Error(`Falló aceptación ${suite}; ver ${output}`);
  }
  console.log(`Aceptación aprobada. Evidencia: ${output}`);
} catch (error) {
  console.error(error.message);
  if (error.output) console.error(error.output);
  process.exitCode = 1;
} finally {
  for (const container of [...containers].reverse()) {
    const logs = await docker(['logs', container], { quiet: true, tolerateFailure: true });
    await writeFile(path.join(output, `${container.endsWith('-api') ? 'backend' : 'database'}.log`), logs.text);
    await docker(['rm', '-f', '-v', container], { quiet: true, tolerateFailure: true });
  }
  if (networkCreated) await docker(['network', 'rm', runId], { quiet: true, tolerateFailure: true });
  await rm(staging, { recursive: true, force: true });
  console.log(`Entorno temporal retirado. Logs: ${output}`);
}
