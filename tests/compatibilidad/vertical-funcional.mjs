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
 const draft=resolve('docs/proposals/02_vertical_academico_BORRADOR.sql'); console.log('SHA256',createHash('sha256').update(await readFile(draft)).digest('hex'),'borrador');
 const migrator=await admin.query("SELECT 1 FROM pg_roles WHERE rolname='lawware_migrador' AND NOT rolsuper AND NOT rolbypassrls AND rolcreaterole"); if(!migrator.rowCount) throw new Error('Migrador local no disponible');
 for(const [key,technical] of [['auth','lawware_auth_service'],['app','lawware_app'],['progress','lawware_progress_service']]) { const role=roles[key]; await admin.query(`CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`); createdRoles.push(role); await admin.query(`GRANT ${technical} TO "${role}"`); }
 for(const [index,db] of databases.entries()) {
  await admin.query(`CREATE DATABASE "${db}" OWNER lawware_migrador`); createdDbs.push(db);
  const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:'lawware_migrador',PGDATABASE:db,PYTHONUTF8:'1'};
  for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE']) delete env[key];
  for(const file of files) run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve(root,file)],env,root);
  const owner=new pg.Client({host:'127.0.0.1',port:55439,user:'lawware_migrador',database:db}); await owner.connect();
  try {
   await owner.query(`INSERT INTO lawware.usuario(id_usuario,auth0_id,nombre,correo,estado) VALUES
    ('90000000-0000-4000-8000-000000000001','auth0|fixture-a','Usuario A ficticio','a@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000002','auth0|fixture-b','Usuario B ficticio','b@example.invalid','ACTIVO'),
    ('90000000-0000-4000-8000-000000000005','auth0|fixture-c','Usuario C ficticio','c@example.invalid','ACTIVO')`);
   run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve('tests/fixtures/vertical.sql')],env,root);
   await owner.query("INSERT INTO lawware.avance_leccion(id_usuario,id_leccion_version,estado,fecha_inicio) VALUES($1,$2,'EN_PROGRESO',clock_timestamp())",['90000000-0000-4000-8000-000000000005','95000000-0000-4000-8000-000000000003']);
   const before=await counts(owner), beforeHash=await snapshot(owner), beforeCatalog=await catalog(owner);
   if(index===1) run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],env,root);
   const after=await counts(owner), afterHash=await snapshot(owner); if(JSON.stringify(before)!==JSON.stringify(after) || beforeHash!==afterHash) throw new Error('La migración alteró datos de los fixtures existentes');
   const afterCatalog=await catalog(owner);
   for(const key of ['tablas','columnas_tabla','restricciones','indices','triggers']) if(beforeCatalog[key]!==afterCatalog[key]) throw new Error(`Cambió el conteo de ${key}`);
   if(index===1 && (afterCatalog.funciones!==beforeCatalog.funciones+2 || afterCatalog.vistas!==beforeCatalog.vistas+2)) throw new Error('Número de objetos añadidos inesperado');
   console.log('CATÁLOGO antes:',JSON.stringify(beforeCatalog),'después:',JSON.stringify(afterCatalog));
   const columns=(await owner.query("SELECT column_name FROM information_schema.columns WHERE table_schema='lawware' AND table_name='v_lecciones_publicadas' ORDER BY ordinal_position")).rows.map(row=>row.column_name);
   const routines=(await owner.query("SELECT to_regprocedure('lawware.fn_permisos_propios()') IS NOT NULL AS permisos,to_regprocedure('lawware.fn_bloquear_leccion_publicada(uuid)') IS NOT NULL AS bloqueo")).rows[0];
   if(index===0 && (columns.includes('id_modulo') || routines.permisos || routines.bloqueo)) throw new Error('Modelo canónico inesperado');
   if(index===1 && (!columns.includes('id_modulo') || !columns.includes('orden') || !routines.permisos || !routines.bloqueo)) throw new Error('Objetos propuestos incompletos');
   console.log(index===0?'MODELO CANÓNICO':'MODELO CON BORRADOR',`columnas=${columns.join(',')}`,`datos_preservados=${JSON.stringify(after)}`,`snapshot_sha256=${afterHash}`);
   if(index===1) {
    const grants=await owner.query(`SELECT
      has_function_privilege('lawware_app','lawware.fn_permisos_propios()','EXECUTE') AS app_permisos,
      has_function_privilege('lawware_progress_service','lawware.fn_permisos_propios()','EXECUTE') AS progreso_permisos,
      has_function_privilege('lawware_progress_service','lawware.fn_bloquear_leccion_publicada(uuid)','EXECUTE') AS progreso_bloqueo,
      has_table_privilege('lawware_app','lawware.v_avisos_vigentes','SELECT') AS app_aviso,
      has_column_privilege('lawware_app','lawware.v_lecciones_publicadas','id_modulo','SELECT') AS app_modulo`);
    if(Object.values(grants.rows[0]).some(value=>value!==true)) throw new Error('No coinciden los grants declarados');
    console.log('GRANTS propuestos:',JSON.stringify(grants.rows[0]));
    const definitions=await owner.query("SELECT proname,pg_get_userbyid(proowner) AS propietario,prosecdef,provolatile,proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lawware' AND proname IN ('fn_permisos_propios','fn_bloquear_leccion_publicada') ORDER BY proname");
    console.log('FUNCIONES:',JSON.stringify(definitions.rows));
    const repeated=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-f',draft],{env,cwd:root,encoding:'utf8'});
    if(repeated.status===0) throw new Error('Se esperaba rechazo por objetos preexistentes');
    if(!repeated.stderr.includes('42723')) throw new Error('La reaplicación falló por un motivo distinto de función existente');
    if(await snapshot(owner)!==afterHash) throw new Error('Reaplicación fallida alteró datos');
    console.log('REAPLICACIÓN: rechazada por objetos existentes; datos de fixture sin cambios');
   }
   const runtime=new pg.Client({host:'127.0.0.1',port:55439,user:roles.app,database:db}); await runtime.connect();
   try { await runtime.query('BEGIN'); await runtime.query("SELECT set_config('app.user_id',$1,true)",['90000000-0000-4000-8000-000000000001']); const modules=await runtime.query('SELECT id_modulo FROM lawware.v_modulos_publicados'); const lessons=await runtime.query('SELECT id_leccion_version FROM lawware.v_lecciones_publicadas'); if(modules.rowCount!==1 || lessons.rowCount!==2) throw new Error('Las vistas publicadas no coinciden con los fixtures'); await runtime.query('ROLLBACK'); } finally { await runtime.end(); }
   console.log('OK lectura de módulos y lecciones publicados con rol aplicativo');
   const testEnv={...env,LAWWARE_TEST_AUTH_URL:`postgresql://${roles.auth}@127.0.0.1:55439/${db}`,LAWWARE_TEST_APP_URL:`postgresql://${roles.app}@127.0.0.1:55439/${db}`,LAWWARE_TEST_OWNER_URL:`postgresql://lawware_migrador@127.0.0.1:55439/${db}`,LAWWARE_TEST_MIXED_URL:`postgresql://${roles.app}@127.0.0.1:55439/${db}`};
   if(index===1) { testEnv.LAWWARE_TEST_PROGRESS_URL=`postgresql://${roles.progress}@127.0.0.1:55439/${db}`; const filter='resuelve permisos reales acumulados|devuelve solo material publicado|persiste avance propio|consulta el aviso'; console.log('COMANDO: vitest run tests/integration/vertical.test.ts -t <cuatro casos funcionales>'); console.log(run(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','tests/integration/vertical.test.ts','-t',filter],testEnv,process.cwd())); }
   else { delete testEnv.LAWWARE_TEST_PROGRESS_URL; console.log('COMANDO: vitest run tests/integration/database.test.ts -t <resolución de identidad>'); console.log(run(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','tests/integration/database.test.ts','-t','resolves Auth0 subjects'],testEnv,process.cwd())); }
  } finally { await owner.end(); }
 }
} catch(error) { console.error(error instanceof Error?error.message:'Fallo funcional'); process.exitCode=1; }
finally { if(verified) { try { for(const db of createdDbs) await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`); for(const role of createdRoles) await admin.query(`DROP ROLE "${role}"`); } catch { console.error('Limpieza incompleta; revisar',createdDbs,createdRoles); process.exitCode=1; } } await admin.end().catch(()=>{}); }
