import { randomBytes, createHash } from 'node:crypto';
import { realpath, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import pg from 'pg';

// Solo funcionalidad y metadatos de dos bases nuevas; no pruebas ofensivas.
const suffix=randomBytes(6).toString('hex');
const databases=[`lawware_backend_test_${randomBytes(6).toString('hex')}`,`lawware_backend_test_${randomBytes(6).toString('hex')}`];
const roles={auth:`lw_compat_auth_${suffix}`,app:`lw_compat_app_${suffix}`,progress:`lw_compat_progress_${suffix}`};
const root=resolve('../LawWare-database');
const psql=process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe':'psql';
const files=['sql/baseline/LawWare_v2_00_esquema.sql','sql/baseline/LawWare_v2_01_integridad.sql','sql/baseline/LawWare_v2_02_seguridad_rls.sql','sql/migrations/v2.1/01_migracion_trazabilidad_auditoria_v2_1.sql'];
const admin=new pg.Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'});
const createdDbs=[], createdRoles=[]; let verified=false;
function run(command,args,env,cwd) { const result=spawnSync(command,args,{env,cwd,encoding:'utf8'}); if(result.status!==0) throw new Error(`Falló ${args.join(' ')}\n${result.stdout}\n${result.stderr}`); return result.stdout; }
async function counts(client) { return (await client.query(`SELECT (SELECT count(*) FROM lawware.usuario)::int AS usuarios,(SELECT count(*) FROM lawware.modulo)::int AS modulos,(SELECT count(*) FROM lawware.leccion)::int AS lecciones,(SELECT count(*) FROM lawware.leccion_version)::int AS versiones,(SELECT count(*) FROM lawware.aviso_privacidad)::int AS avisos,(SELECT count(*) FROM lawware.aviso_finalidad)::int AS finalidades,(SELECT count(*) FROM lawware.rol)::int AS roles,(SELECT count(*) FROM lawware.permiso)::int AS permisos,(SELECT count(*) FROM lawware.avance_leccion)::int AS avances`)).rows[0]; }
async function catalog(client) { return (await client.query(`SELECT
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lawware' AND c.relkind='r')::int AS tablas,
 (SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lawware' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped)::int AS columnas_tabla,
 (SELECT count(*) FROM pg_constraint x JOIN pg_namespace n ON n.oid=x.connamespace WHERE n.nspname='lawware')::int AS restricciones,
 (SELECT count(*) FROM pg_indexes WHERE schemaname='lawware')::int AS indices,
 (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lawware' AND NOT t.tgisinternal)::int AS triggers,
 (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lawware')::int AS funciones,
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='lawware' AND c.relkind='v')::int AS vistas`)).rows[0]; }
async function snapshot(client) {
 const result=await client.query(`SELECT jsonb_build_object(
  'usuarios',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_usuario),'[]'::jsonb) FROM lawware.usuario t),
  'modulos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_modulo),'[]'::jsonb) FROM lawware.modulo t),
  'lecciones',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_leccion),'[]'::jsonb) FROM lawware.leccion t),
  'versiones',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_leccion_version),'[]'::jsonb) FROM lawware.leccion_version t),
  'avisos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_aviso),'[]'::jsonb) FROM lawware.aviso_privacidad t),
  'finalidades',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_aviso,id_finalidad),'[]'::jsonb) FROM lawware.aviso_finalidad t),
  'roles',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_rol),'[]'::jsonb) FROM lawware.rol t),
  'permisos',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_permiso),'[]'::jsonb) FROM lawware.permiso t),
  'asignaciones',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_usuario_rol),'[]'::jsonb) FROM lawware.usuario_rol t),
  'rol_permiso',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_rol,id_permiso),'[]'::jsonb) FROM lawware.rol_permiso t),
  'avances',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id_usuario,id_leccion_version),'[]'::jsonb) FROM lawware.avance_leccion t)) AS datos`);
 return createHash('sha256').update(JSON.stringify(result.rows[0].datos)).digest('hex');
}
try {
 await admin.connect(); const dir=(await admin.query('SHOW data_directory')).rows[0]?.data_directory;
 if(!dir || await realpath(dir)!==await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster local inesperado'); verified=true;
 console.log('Servidor:',(await admin.query('SELECT version() AS v')).rows[0].v);
 const psqlVersion=run(psql,['--version'],process.env,root).trim(); console.log('Cliente:',psqlVersion);
 for(const file of files) console.log('SHA256',createHash('sha256').update(await readFile(resolve(root,file))).digest('hex'),file);
 const draft=resolve('docs/proposals/03_vertical_academico_REVISION.sql'); console.log('SHA256',createHash('sha256').update(await readFile(draft)).digest('hex'),'candidata');
 const migrator=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lawware_migrador' AND NOT rolsuper AND NOT rolbypassrls AND rolcreaterole"); if(!migrator.rowCount) throw new Error('Migrador local no disponible');
 for(const [key,technical] of [['auth','lawware_auth_service'],['app','lawware_app'],['progress','lawware_progress_service']]) { const role=roles[key]; await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); createdRoles.push(role); await admin.query(`GRANT ${technical} TO "${role}"`); }
 for(const [index,db] of databases.entries()) {
  await admin.query(`CREATE DATABASE "${db}" OWNER lawware_migrador`); createdDbs.push(db);
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:'lawware_migrador',PGDATABASE:db,PYTHONUTF8:'1'};
  for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE']) delete env[key];
  if(index===1) {
   const invalid=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],{env,cwd:root,encoding:'utf8'});
   if(invalid.status===0 || !invalid.stderr.includes('LAWWARE_SCHEMA_OWNER_REQUIRED')) throw new Error('No se rechazó la base sin esquema v2.1');
   const emptyCheck=new pg.Client({host:'127.0.0.1',port:55439,user:'lawware_migrador',database:db}); await emptyCheck.connect();
   try { if((await emptyCheck.query("SELECT to_regnamespace('lawware') IS NOT NULL AS present")).rows[0].present) throw new Error('El preflight creó objetos'); } finally { await emptyCheck.end(); }
   console.log('PREFLIGHT: base sin esquema rechazada sin crear objetos');
  }
  for(const [fileIndex,file] of files.entries()) {
   if(index===1 && fileIndex===3) {
    const v20=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(v20.status===0 || !v20.stderr.includes('LAWWARE_BASE_V21_REQUIRED')) throw new Error('No se rechazó v2.0 sin la migración v2.1');
    console.log('PREFLIGHT: v2.0 sin marcadores v2.1 rechazada');
   }
   run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve(root,file)],env,root);
  }
  const owner=new pg.Client({host:'127.0.0.1',port:55439,user:'lawware_migrador',database:db}); await owner.connect();
  try {
   await owner.query(`INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
    ('90000000-0000-4000-8000-000000000001','auth0|fixture-a','Usuario A ficticio','a@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000002','auth0|fixture-b','Usuario B ficticio','b@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000005','auth0|fixture-c','Usuario C ficticio','c@example.invalid','ACTIVO')`);
   run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve('tests/fixtures/vertical.sql')],env,root);
   await owner.query("INSERT INTO lawware.avance_leccion(id_usuario,id_leccion_version,estado,fecha_inicio) VALUES($1,$2,'EN_PROGRESO',clock_timestamp())",['90000000-0000-4000-8000-000000000005','95000000-0000-4000-8000-000000000003']);
   const before=await counts(owner), beforeHash=await snapshot(owner), beforeCatalog=await catalog(owner);
   const beforeView=(await owner.query("SELECT pg_get_viewdef('lawware.v_lecciones_publicadas'::regclass,true) AS definition")).rows[0].definition;
   const beforeViewRows=JSON.stringify((await owner.query('SELECT * FROM lawware.v_lecciones_publicadas ORDER BY id_leccion_version')).rows);
   if(index===1) {
    await owner.query('CREATE TABLE lawware.migraciones_esquema(version text)');
    const ledgerConflict=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(ledgerConflict.status===0 || !ledgerConflict.stderr.includes('LAWWARE_MIGRATION_LEDGER_INCOMPATIBLE')) throw new Error('Registro de versiones incompatible no rechazado');
    await owner.query('DROP TABLE lawware.migraciones_esquema');
    await owner.query('CREATE VIEW lawware.v_lecciones_academicas AS SELECT 1 AS fixture');
    const conflict=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(conflict.status===0 || !conflict.stderr.includes('LAWWARE_MIGRATION_OBJECT_CONFLICT')) throw new Error('Conflicto de objetos no rechazado');
    await owner.query('DROP VIEW lawware.v_lecciones_academicas');
    if((await owner.query("SELECT to_regclass('lawware.migraciones_esquema') IS NOT NULL AS present")).rows[0].present) throw new Error('El preflight en conflicto creó el registro');
    const sql=await readFile(draft,'utf8'); const injected=sql.replace(/COMMIT;\s*$/,'SELECT 1/0;\nCOMMIT;\n');
    if(injected===sql) throw new Error('No se pudo preparar la prueba de rollback');
    const aborted=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],{env,cwd:root,encoding:'utf8',input:injected});
    if(aborted.status===0 || !aborted.stderr.includes('22012')) throw new Error('No se ejecutó el error deliberado posterior al DDL');
    if((await owner.query("SELECT to_regclass('lawware.migraciones_esquema') IS NOT NULL AS ledger,to_regclass('lawware.v_lecciones_academicas') IS NOT NULL AS view,to_regprocedure('lawware.fn_permisos_propios()') IS NOT NULL AS func")).rows.some(row=>row.ledger||row.view||row.func) || await snapshot(owner)!==beforeHash) throw new Error('El rollback dejó cambios parciales');
    console.log('PREFLIGHT: registro incompatible y conflicto rechazados; ROLLBACK: error posterior al DDL no dejó objetos ni cambios');
    run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],env,root);
   }
   const after=await counts(owner), afterHash=await snapshot(owner); if(JSON.stringify(before)!==JSON.stringify(after) || beforeHash!==afterHash) throw new Error('La migración alteró datos de los fixtures existentes');
   const afterCatalog=await catalog(owner);
   if(index===0 && JSON.stringify(beforeCatalog)!==JSON.stringify(afterCatalog)) throw new Error('Cambió el catálogo base');
   if(index===1 && (afterCatalog.tablas!==beforeCatalog.tablas+1 || afterCatalog.columnas_tabla!==beforeCatalog.columnas_tabla+3 || afterCatalog.restricciones!==beforeCatalog.restricciones+1 || afterCatalog.indices!==beforeCatalog.indices+1 || afterCatalog.triggers!==beforeCatalog.triggers || afterCatalog.funciones!==beforeCatalog.funciones+2 || afterCatalog.vistas!==beforeCatalog.vistas+1)) throw new Error('Número de objetos añadidos inesperado');
   console.log('CATÁLOGO antes:',JSON.stringify(beforeCatalog),'después:',JSON.stringify(afterCatalog));
   const columns=(await owner.query("SELECT column_name FROM information_schema.columns WHERE table_schema='lawware' AND table_name='v_lecciones_publicadas' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
   const routines=(await owner.query("SELECT to_regprocedure('lawware.fn_permisos_propios()') IS NOT NULL AS permisos,to_regprocedure('lawware.fn_bloquear_leccion_publicada(uuid)') IS NOT NULL AS bloqueo")).rows[0];
   if(index===0 && (columns.includes('id_modulo') || routines.permisos || routines.bloqueo)) throw new Error('Modelo canónico inesperado');
   if(index===1 && (columns.includes('id_modulo') || columns.includes('orden') || !routines.permisos || !routines.bloqueo)) throw new Error('Contrato canónico o funciones incorrectos');
   if(beforeView!==(await owner.query("SELECT pg_get_viewdef('lawware.v_lecciones_publicadas'::regclass,true) AS definition")).rows[0].definition || beforeViewRows!==JSON.stringify((await owner.query('SELECT * FROM lawware.v_lecciones_publicadas ORDER BY id_leccion_version')).rows)) throw new Error('Cambió la vista canónica');
   console.log(index===0?'MODELO CANÓNICO':'MODELO CON CANDIDATA',`columnas=${columns.join(',')}`,`datos_preservados=${JSON.stringify(after)}`,`snapshot_sha256=${afterHash}`);
   if(index===1) {
    const grants=await owner.query(`SELECT
      has_function_privilege('lawware_app','lawware.fn_permisos_propios()','EXECUTE') AS app_permisos,
      has_function_privilege('lawware_progress_service','lawware.fn_permisos_propios()','EXECUTE') AS progreso_permisos,
      has_function_privilege('lawware_progress_service','lawware.fn_bloquear_leccion_publicada(uuid)','EXECUTE') AS progreso_bloqueo,
      has_table_privilege('lawware_app','lawware.v_lecciones_academicas','SELECT') AS app_vista,
      NOT has_table_privilege('lawware_app','lawware.migraciones_esquema','SELECT') AS ledger_reservado`);
    if(Object.values(grants.rows[0]).some(value=>value!==true)) throw new Error('No coinciden los grants declarados');
    console.log('GRANTS propuestos:',JSON.stringify(grants.rows[0]));
    const definitions=await owner.query("SELECT proname,pg_get_userbyid(proowner) AS propietario,prosecdef,provolatile,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lawware' AND proname IN ('fn_permisos_propios','fn_bloquear_leccion_publicada') ORDER BY proname");
    console.log('FUNCIONES:',JSON.stringify(definitions.rows));
    const repeated=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(repeated.status===0) throw new Error('Se esperaba rechazo por objetos preexistentes');
    if(!repeated.stderr.includes('LAWWARE_MIGRATION_ALREADY_APPLIED')) throw new Error('Reaplicación no rechazada con mensaje controlado');
    if(await snapshot(owner)!==afterHash) throw new Error('Reaplicación fallida alteró datos');
    const versions=await owner.query("SELECT version,base_requerida FROM lawware.migraciones_esquema WHERE version='v2.1/03_vertical_academico'");
    if(versions.rowCount!==1) throw new Error('Registro de migración ausente o duplicado');
    const academicCols=await owner.query("SELECT a.attname,format_type(a.atttypid,a.atttypmod) AS tipo FROM pg_attribute a WHERE a.attrelid='lawware.v_lecciones_academicas'::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum");
    if(academicCols.rows.map(row=>row.attname).join(',')!=='id_leccion_version,id_leccion,numero_version,titulo,contenido,id_modulo,orden') throw new Error('Columnas de vista académica inesperadas');
    const privacy=(await owner.query("SELECT to_regclass('lawware.v_avisos_vigentes') IS NOT NULL AS aviso,to_regclass('lawware.v_finalidades_aviso_vigente') IS NOT NULL AS finalidades")).rows[0];
    if(privacy.aviso||privacy.finalidades) throw new Error('La candidata creó vistas de privacidad');
    console.log('REAPLICACIÓN: rechazo controlado; versión registrada exactamente una vez');
    console.log('VISTA ACADÉMICA:',JSON.stringify(academicCols.rows),'PRIVACIDAD:',JSON.stringify(privacy));
   }
   const runtime=new pg.Client({host:'127.0.0.1',port:55439,user:roles.app,database:db}); await runtime.connect();
   try { await runtime.query('BEGIN'); await runtime.query("SELECT set_config('app.user_id',$1,true)",['90000000-0000-4000-8000-000000000001']); const modules=await runtime.query('SELECT id_modulo FROM lawware.v_modulos_publicados'); const lessons=await runtime.query('SELECT id_leccion_version FROM lawware.v_lecciones_publicadas'); if(modules.rowCount!==1 || lessons.rowCount!==2) throw new Error('Las vistas publicadas no coinciden con los fixtures'); await runtime.query('ROLLBACK'); } finally { await runtime.end(); }
   console.log('OK lectura de módulos y lecciones publicados con rol aplicativo');
   const testEnv={...env,LAWWARE_TEST_AUTH_URL:`postgresql://${roles.auth}@127.0.0.1:55439/${db}`,LAWWARE_TEST_APP_URL:`postgresql://${roles.app}@127.0.0.1:55439/${db}`,LAWWARE_TEST_OWNER_URL:`postgresql://lawware_migrador@127.0.0.1:55439/${db}`,LAWWARE_TEST_MIXED_URL:`postgresql://${roles.app}@127.0.0.1:55439/${db}`};
   if(index===1) { testEnv.LAWWARE_TEST_PROGRESS_URL=`postgresql://${roles.progress}@127.0.0.1:55439/${db}`; testEnv.LAWWARE_TEST_CANDIDATE='1'; const filter='resuelve permisos reales acumulados|devuelve solo material publicado|persiste avance propio|deniega sin token|comprueba permiso insuficiente|aísla escrituras simultáneas|revierte cambios|serializa la retirada|CANDIDATA mantiene'; console.log('COMANDO: vitest run tests/integration/vertical.test.ts -t <nueve casos funcionales>'); console.log(run(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','tests/integration/vertical.test.ts','-t',filter],testEnv,process.cwd())); }
   else {
    delete testEnv.LAWWARE_TEST_PROGRESS_URL;
    console.log('COMANDO: vitest run tests/integration/database.test.ts -t <resolución de identidad>');
    console.log(run(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','tests/integration/database.test.ts','-t','resolves Auth0 subjects'],testEnv,process.cwd()));
    const beforeOld=await snapshot(owner);
    run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve('docs/proposals/02_vertical_academico_BORRADOR.sql')],env,root);
    const oldConflict=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(oldConflict.status===0 || !oldConflict.stderr.includes('LAWWARE_CANONICAL_VIEW_INCOMPATIBLE')) throw new Error('No se rechazó el borrador previo ya instalado');
    if(await snapshot(owner)!==beforeOld || (await owner.query("SELECT to_regclass('lawware.migraciones_esquema') IS NOT NULL AS present")).rows[0].present) throw new Error('Rechazo del borrador previo dejó cambios');
    console.log('PRECONDICIÓN: candidata rechaza esquema con el borrador 02 instalado; sin cambios en fixtures');
   }
  } finally { await owner.end(); }
 }
} catch(error) { console.error(error instanceof Error?error.message:'Fallo funcional'); process.exitCode=1; }
finally { if(verified) { try { for(const db of createdDbs) await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`); for(const role of createdRoles) await admin.query(`DROP ROLE "${role}"`); } catch { console.error('Limpieza incompleta; revisar',createdDbs,createdRoles); process.exitCode=1; } } await admin.end().catch(()=>{}); }
