import 'dotenv/config';
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import console from 'node:console';
import process from 'node:process';
import pg from 'pg';
import { createPool } from '../../dist/infrastructure/database/pool.js';
import { withTransaction } from '../../dist/infrastructure/database/transaction.js';
import { capabilities } from '../../dist/modules/authorization/application/capabilities.js';
import { progress, saveProgress } from '../../dist/modules/academic/infrastructure/academic-repository.js';

// Solo fase de lectura: la escritura solicitada debe rechazarse y revertirse.
const appUrl = process.env.APP_DATABASE_URL, progressUrl = process.env.PROGRESS_DATABASE_URL;
if (!appUrl || !progressUrl) throw new Error('Faltan pools locales de aplicación y progreso');
const appConnection = new URL(appUrl), progressConnection = new URL(progressUrl);
const match = /^\/lawware_dev_synthetic_([a-f0-9]{12})$/.exec(appConnection.pathname);
if (!match || [appConnection, progressConnection].some(url => url.hostname !== '127.0.0.1' || url.port !== '55439' || url.pathname !== appConnection.pathname)
    || appConnection.username !== `lw_lab_app_${match[1]}` || progressConnection.username !== `lw_lab_progress_${match[1]}`) throw new Error('Se requiere el laboratorio local sintético');
const probe = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
const app = createPool(appUrl, 2), writer = createPool(progressUrl, 1);
const users = ['90000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000002'];
const context = userId => ({ requestId: '00000000-0000-4000-8000-000000000001', correlationId: '00000000-0000-4000-8000-000000000002', service: 'lawware-api', userId });
try {
  await probe.connect();
  const directory = (await probe.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!directory || await realpath(directory) !== await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster inesperado');
  const results = await Promise.all(users.map(userId => withTransaction(app, 'lawware_app', context(userId), async client => {
    const pid = (await client.query('SELECT pg_backend_pid() AS pid,pg_sleep(0.2)')).rows[0].pid;
    return { pid, permissions: (await capabilities(client)).capabilities, states: (await progress(client, userId)).map(row => row.estado) };
  })));
  assert.notEqual(results[0].pid, results[1].pid);
  assert.ok(results[0].states.includes('COMPLETADA'));
  assert.equal(results[1].states.length, 0);
  assert.deepEqual(results[1].permissions, ['ACADEMIC_READ']);
  await assert.rejects(withTransaction(writer, 'lawware_progress_service', context(users[1]), async client => {
    await saveProgress(client, users[1], '95000000-0000-4000-8000-000000000001', 'COMPLETADA');
    throw new Error('Rollback: escritura inesperadamente permitida');
  }),
  error => error?.status === 403 && error?.code === 'FORBIDDEN');
  const after = await withTransaction(app, 'lawware_app', context(users[1]), client => progress(client, users[1]));
  assert.equal(after.length, 0);
  console.log('OK: dos conexiones, avance aislado y escritura de B rechazada con 403; sin cambios persistidos.');
} catch {
  console.error('Falló la comprobación de aislamiento local de lectura.');
  process.exitCode = 1;
} finally {
  await probe.end().catch(() => {});
  await Promise.all([app.end(), writer.end()]);
}
