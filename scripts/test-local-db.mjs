import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';

// This script creates and drops only its own generated local test database.
const project = process.cwd();
const expected = resolve(project, '../_local/temporary/pg-local');
const databaseRepo = resolve(project, '../LawWare-database');
const psql = process.env.PSQL || (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe' : 'psql');
const suffix = randomBytes(6).toString('hex');
const database = `lawware_backend_test_${suffix}`;
const authRole = `lw_auth_${suffix}`;
const appRole = `lw_app_${suffix}`;
const mixedRole = `lw_mixed_${suffix}`;
const progressRole = `lw_progress_${suffix}`;
const draft = process.argv.includes('--draft');
const admin = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
let databaseCreated = false;
let authCreated = false;
let appCreated = false;
let mixedCreated = false;
let progressCreated = false;
let exitCode = 1;
try {
  await admin.connect();
  const dataDir = (await admin.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!dataDir || await realpath(dataDir) !== await realpath(expected)) throw new Error('El servidor no corresponde al clúster local aislado');
  const check = await admin.query("SELECT rolname, rolsuper, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname='lawware_migrador'");
  if (check.rowCount === 0) await admin.query('CREATE ROLE lawware_migrador LOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS');
  else if (check.rows[0].rolsuper || check.rows[0].rolbypassrls || !check.rows[0].rolcreaterole) throw new Error('Rol migrador local inesperado');
  await admin.query(`CREATE DATABASE "${database}" OWNER lawware_migrador`);
  databaseCreated = true;
  const env = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '55439', PGUSER: 'lawware_migrador', PGDATABASE: database, PYTHONUTF8: '1' };
  for (const key of ['PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS', 'PGPASSWORD', 'PGPASSFILE']) delete env[key];
  const sqlFiles = [
    'sql/baseline/LawWare_v2_00_esquema.sql', 'sql/baseline/LawWare_v2_01_integridad.sql',
    'sql/baseline/LawWare_v2_02_seguridad_rls.sql', 'sql/migrations/v2.1/01_migracion_trazabilidad_auditoria_v2_1.sql',
  ];
  for (const file of sqlFiles) {
    const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', resolve(databaseRepo, file)], { env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Falló instalación ${file}: ${result.stderr || result.error?.message || 'psql error'}`);
  }
  if (draft) {
    console.log('Aplicando BORRADOR no aprobado exclusivamente a una base desechable local');
    const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', resolve(project, 'docs/proposals/02_vertical_academico_BORRADOR.sql')], { env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Falló el borrador aislado: ${result.stderr || result.error?.message}`);
  }
  await admin.query(`CREATE ROLE "${authRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  authCreated = true;
  await admin.query(`CREATE ROLE "${appRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  appCreated = true;
  await admin.query(`CREATE ROLE "${mixedRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
  mixedCreated = true;
  await admin.query(`GRANT lawware_auth_service TO "${authRole}"`);
  await admin.query(`GRANT lawware_app TO "${appRole}"`);
  await admin.query(`GRANT lawware_app, lawware_auth_service TO "${mixedRole}"`);
  if (draft) {
    await admin.query(`CREATE ROLE "${progressRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    progressCreated = true;
    await admin.query(`GRANT lawware_progress_service TO "${progressRole}"`);
  }
  const owner = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'lawware_migrador', database });
  await owner.connect();
  try {
    await owner.query(`INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
      ('90000000-0000-4000-8000-000000000001','auth0|fixture-a','Usuario A ficticio','a@example.invalid','ACTIVO'),
      ('90000000-0000-4000-8000-000000000002','auth0|fixture-b','Usuario B ficticio','b@example.invalid','ACTIVO'),
      ('90000000-0000-4000-8000-000000000003','auth0|fixture-blocked','Bloqueado ficticio','blocked@example.invalid','BLOQUEADO'),
      ('90000000-0000-4000-8000-000000000004','auth0|fixture-inactive','Inactivo ficticio','inactive@example.invalid','INACTIVO'),
      ('90000000-0000-4000-8000-000000000005','auth0|fixture-c','Usuario C ficticio','c@example.invalid','ACTIVO')`);
  } finally { await owner.end(); }
  if (draft) {
    const result = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', resolve(project, 'tests/fixtures/vertical.sql')], { env, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Fallaron fixtures: ${result.stderr || result.error?.message}`);
  }
  const testEnv = { ...env,
    LAWWARE_TEST_AUTH_URL: `postgresql://${authRole}@127.0.0.1:55439/${database}`,
    LAWWARE_TEST_APP_URL: `postgresql://${appRole}@127.0.0.1:55439/${database}`,
    LAWWARE_TEST_OWNER_URL: `postgresql://lawware_migrador@127.0.0.1:55439/${database}`,
    LAWWARE_TEST_MIXED_URL: `postgresql://${mixedRole}@127.0.0.1:55439/${database}`,
    ...(draft ? { LAWWARE_TEST_PROGRESS_URL: `postgresql://${progressRole}@127.0.0.1:55439/${database}` } : {}),
  };
  console.log('PostgreSQL local aislado: esquema v2.1 y roles sintéticos preparados');
  const testFiles = draft ? ['tests/integration/database.test.ts','tests/integration/vertical.test.ts'] : ['tests/integration/database.test.ts'];
  const tests = spawnSync(process.execPath, [resolve(project, 'node_modules/vitest/vitest.mjs'), 'run', ...testFiles], { cwd: project, env: testEnv, stdio: 'inherit' });
  if (tests.status !== 0) throw new Error(`Pruebas de integración fallaron: ${tests.status}`);
  exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Error en prueba local');
} finally {
  try {
    if (databaseCreated) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (authCreated) await admin.query(`DROP ROLE "${authRole}"`);
    if (appCreated) await admin.query(`DROP ROLE "${appRole}"`);
    if (mixedCreated) await admin.query(`DROP ROLE "${mixedRole}"`);
    if (progressCreated) await admin.query(`DROP ROLE "${progressRole}"`);
    await admin.end();
  } catch {
    console.error('No se completó la limpieza de la base o roles de prueba');
    exitCode = 1;
  }
}
process.exitCode = exitCode;
