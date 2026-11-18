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
import { listModules, progress } from '../../dist/modules/academic/infrastructure/academic-repository.js';

// Lectura concurrente únicamente; no crea cuentas ni modifica filas.
const raw = process.env.APP_DATABASE_URL;
if (!raw) throw new Error('Falta la configuración del pool aplicativo');
const url = new URL(raw);
const match = /^\/lawware_dev_synthetic_([a-f0-9]{12})$/.exec(url.pathname);
if (!match || url.hostname !== '127.0.0.1' || url.port !== '55439' || url.username !== `lw_lab_app_${match[1]}`) throw new Error('Se requiere un laboratorio local sintético');
const probe = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
const pool = createPool(raw, 4);
try {
  await probe.connect();
  const directory = (await probe.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!directory || await realpath(directory) !== await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster inesperado');
  const context = { requestId: '00000000-0000-4000-8000-000000000001', correlationId: '00000000-0000-4000-8000-000000000002', service: 'lawware-api', userId: '90000000-0000-4000-8000-000000000001' };
  const results = await Promise.all(Array.from({ length: 8 }, () => withTransaction(pool, 'lawware_app', context, async client => {
    const pid = (await client.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.2)')).rows[0].pid;
    const permissions = await capabilities(client);
    const modules = await listModules(client);
    const advances = await progress(client, context.userId);
    return { pid, permissions: permissions.capabilities, modules: modules.length, advances: advances.map(row => row.estado) };
  })));
  assert.ok(new Set(results.map(result => result.pid)).size >= 2, 'Se requieren conexiones físicas distintas');
  const first = JSON.stringify({ ...results[0], pid: undefined });
  assert.ok(results.every(result => JSON.stringify({ ...result, pid: undefined }) === first), 'Las lecturas concurrentes difieren');
  assert.ok(results[0].permissions.includes('ACADEMIC_READ'));
  console.log(`OK: ${results.length} lecturas concurrentes coherentes; conexiones físicas distintas: ${new Set(results.map(result => result.pid)).size}.`);
} catch {
  console.error('Falló la comprobación concurrente de lectura local.');
  process.exitCode = 1;
} finally {
  await probe.end().catch(() => {});
  await pool.end();
}
