import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';
import process from 'node:process';
import console from 'node:console';

// Un laboratorio creado aquí solo se elimina tras confirmación explícita.
if (process.env.NODE_ENV !== 'development' || process.env.LAWWARE_INIT_LOCAL !== '1') throw new Error('Requiere NODE_ENV=development y LAWWARE_INIT_LOCAL=1');
if (!process.stdin.isTTY && !process.argv.includes('--self-test')) throw new Error('Requiere una terminal interactiva; no se crearon recursos');
const suffix = randomBytes(6).toString('hex');
const database = `lawware_dev_synthetic_${suffix}`;
const roles = { auth: `lw_lab_auth_${suffix}`, app: `lw_lab_app_${suffix}`, progress: `lw_lab_progress_${suffix}` };
const admin = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
const createdRoles = [];
let created = false, ready = false, cleanup = false;
const files = ['../LawWare-database/sql/baseline/LawWare_v2_00_esquema.sql', '../LawWare-database/sql/baseline/LawWare_v2_01_integridad.sql', '../LawWare-database/sql/baseline/LawWare_v2_02_seguridad_rls.sql', '../LawWare-database/sql/migrations/v2.1/01_migracion_trazabilidad_auditoria_v2_1.sql', 'docs/proposals/03_vertical_academico_REVISION.sql', 'tests/fixtures/academico-minimo.sql'];
const psql = process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe' : 'psql';
try {
  await admin.connect();
  const directory = (await admin.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!directory || await realpath(directory) !== await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster local inesperado');
  if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lawware_migrador' AND NOT rolsuper AND NOT rolbypassrls AND rolcreaterole")).rowCount) throw new Error('Migrador local no disponible');
  await admin.query(`CREATE DATABASE "${database}" OWNER lawware_migrador`); created = true;
  const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'lawware_migrador', PGDATABASE: database };
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSWORD', 'PGPASSFILE']) delete env[key];
  for (const [key, technical] of [['auth', 'lawware_auth_service'], ['app', 'lawware_app'], ['progress', 'lawware_progress_service']]) {
    const role = roles[key];
    await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); createdRoles.push(role);
    await admin.query(`GRANT ${technical} TO "${role}"`);
  }
  for (const file of files.slice(0, -1)) {
    const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', resolve(file)], { env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Falló la instalación de ${file}`);
  }
  const owner = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'lawware_migrador', database });
  await owner.connect();
  try {
    await owner.query(`INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
      ('90000000-0000-4000-8000-000000000001','auth0|fixture-a','Usuario A ficticio','a@example.invalid','ACTIVO')`);
  } finally { await owner.end(); }
  const fixture = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', resolve(files.at(-1))], { env, encoding: 'utf8' });
  if (fixture.status !== 0) throw new Error('Falló la carga de fixtures sintéticos');
  ready = true;
  console.log(`Laboratorio desechable: ${database}`);
  for (const key of ['auth', 'app', 'progress']) console.log(`Rol ${key}: ${roles[key]}`);
  if (process.argv.includes('--self-test')) cleanup = true;
  else {
    console.log('La sesión sigue activa. Cerrar la terminal o interrumpirla conserva los recursos.');
    console.log(`Para finalizar, detenga backend y frontend y escriba exactamente: ELIMINAR ${database}`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    cleanup = await new Promise(resolveWait => {
      let done = false;
      const finish = value => { if (!done) { done = true; rl.close(); resolveWait(value); } };
      rl.on('line', line => { if (line.trim() === `ELIMINAR ${database}`) finish(true); else console.log('Laboratorio conservado; la confirmación no coincide.'); });
      rl.once('close', () => finish(false));
      rl.once('SIGINT', () => finish(false));
      process.once('SIGINT', () => finish(false));
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Error de laboratorio'); process.exitCode = 1;
} finally {
  try {
    if (!ready || cleanup) {
      if (created) await admin.query(`DROP DATABASE "${database}"`);
      for (const role of createdRoles) await admin.query(`DROP ROLE "${role}"`);
      if (created) console.log('Base y roles de esta sesión eliminados.');
    } else if (created) console.log(`Recursos conservados: base ${database}; roles ${createdRoles.join(', ')}.`);
  } catch {
    console.error(`Limpieza incompleta: revisar manualmente ${database} y ${createdRoles.join(', ')}.`); process.exitCode = 1;
  }
  await admin.end().catch(() => {});
}
