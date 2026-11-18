import { randomBytes } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import process from 'node:process';
import console from 'node:console';

// Crea un laboratorio persistente, sin aplicar el borrador de migración.
if (process.env.NODE_ENV !== 'development' || process.env.LAWWARE_INIT_LOCAL !== '1') throw new Error('Requiere NODE_ENV=development y LAWWARE_INIT_LOCAL=1');
const suffix = randomBytes(6).toString('hex');
const database = `lawware_dev_synthetic_${suffix}`;
const roles = { auth:`lw_lab_auth_${suffix}`, app:`lw_lab_app_${suffix}`, progress:`lw_lab_progress_${suffix}` };
const admin = new pg.Client({ host:'127.0.0.1',port:55439,user:'postgres',database:'postgres' });
let created = false, complete = false;
const createdRoles = [];
try {
  await admin.connect();
  const dir = (await admin.query('SHOW data_directory')).rows[0]?.data_directory;
  if (!dir || await realpath(dir) !== await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster local inesperado');
  if (!(await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lawware_migrador' AND NOT rolsuper AND NOT rolbypassrls AND rolcreaterole")).rowCount) throw new Error('Migrador de laboratorio no disponible');
  await admin.query(`CREATE DATABASE "${database}" OWNER lawware_migrador`); created=true;
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:'lawware_migrador',PGDATABASE:database};
  for (const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE']) delete env[key];
  const psql = process.env.PSQL || (process.platform === 'win32' ? 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe' : 'psql');
  const files=['../LawWare-database/sql/baseline/LawWare_v2_00_esquema.sql','../LawWare-database/sql/baseline/LawWare_v2_01_integridad.sql','../LawWare-database/sql/baseline/LawWare_v2_02_seguridad_rls.sql','../LawWare-database/sql/migrations/v2.1/01_migracion_trazabilidad_auditoria_v2_1.sql'];
  for (const file of files) { const result=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve(file)],{env,encoding:'utf8'}); if(result.status!==0) throw new Error(`Falló instalación ${file}`); }
  for (const [key,technical] of [['auth','lawware_auth_service'],['app','lawware_app'],['progress','lawware_progress_service']]) {
    const role=roles[key]; await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); createdRoles.push(role);
    await admin.query(`GRANT ${technical} TO "${role}"`);
  }
  const owner=new pg.Client({host:'127.0.0.1',port:55439,user:'lawware_migrador',database}); await owner.connect();
  try { await owner.query(`INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
    ('90000000-0000-4000-8000-000000000001','auth0|fixture-a','Usuario A ficticio','a@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000002','auth0|fixture-b','Usuario B ficticio','b@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000005','auth0|fixture-c','Usuario C ficticio','c@example.invalid','ACTIVO')`); } finally { await owner.end(); }
  const fixture=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve('tests/fixtures/vertical.sql')],{env,encoding:'utf8'});
  if(fixture.status!==0) throw new Error('Falló la carga de datos sintéticos');
  if (process.argv.includes('--self-test')) {
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); created=false;
    for (const role of createdRoles) await admin.query(`DROP ROLE "${role}"`);
    createdRoles.length=0; complete=true;
    console.log('Laboratorio sintético inicializado, verificado y eliminado.');
  } else {
  complete=true;
  console.log(`Base sintética: ${database}\nRoles técnicos: ${roles.auth}, ${roles.app}, ${roles.progress}`);
  console.log('El borrador SQL NO se ha aplicado. Esta base no está lista para el flujo académico hasta su revisión y aprobación.');
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'Error de laboratorio'); process.exitCode=1; }
finally {
  if (!complete) {
    try { if(created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); for(const role of createdRoles) await admin.query(`DROP ROLE "${role}"`); }
    catch { console.error(`Limpieza incompleta; revisar base ${database} y roles ${createdRoles.join(', ')}.`); process.exitCode=1; }
  }
  await admin.end().catch(()=>{});
}
