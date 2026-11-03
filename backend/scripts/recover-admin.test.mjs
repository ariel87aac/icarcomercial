import assert from 'node:assert/strict';
import test from 'node:test';
import { recoverySettings } from './recover-admin.mjs';
const env = { NODE_ENV: 'development', INITIAL_ADMIN_PASSWORD: 'RecoveryTest123!' };
test('solo permite ejecución explícita en desarrollo o test', () => {
  for (const mode of [undefined, 'production', 'staging']) assert.throws(() => recoverySettings({ ...env, NODE_ENV: mode }), /solo admite/);
  assert.equal(recoverySettings({ ...env, NODE_ENV: 'test' }).username, 'admin');
});
test('normaliza identidad sin modificar ni exponer la contraseña', () => {
  const settings = recoverySettings({ ...env, INITIAL_ADMIN_USERNAME: ' Admin ', INITIAL_ADMIN_EMAIL: ' ADMIN@ICAR.LOCAL ' });
  assert.equal(settings.username, 'admin');
  assert.equal(settings.email, 'admin@icar.local');
  assert.equal(settings.password, env.INITIAL_ADMIN_PASSWORD);
});
test('rechaza contraseñas ausentes, cortas o truncables por bcrypt', () => {
  for (const password of [undefined, '', '12345', 'á'.repeat(37)]) assert.throws(() => recoverySettings({ ...env, INITIAL_ADMIN_PASSWORD: password }), /INITIAL_ADMIN_PASSWORD/);
});
test('rechaza identidad inválida y argumentos desconocidos', () => {
  assert.throws(() => recoverySettings({ ...env, INITIAL_ADMIN_EMAIL: 'incorrecto' }), /EMAIL/);
  assert.throws(() => recoverySettings({ ...env, INITIAL_ADMIN_USERNAME: '' }), /USERNAME/);
  for (const args of [['--force'], ['--user-id'], ['--user-id', 'incorrecto']]) assert.throws(() => recoverySettings(env, args), /Uso/);
  const id = '12345678-1234-1234-1234-123456789abc';
  assert.equal(recoverySettings(env, ['--user-id', id]).userId, id);
});
