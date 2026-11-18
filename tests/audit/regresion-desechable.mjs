import { randomBytes, createHash } from 'node:crypto';
import { realpath, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import process from 'node:process';
import console from 'node:console';

// Auditoría de dos bases creadas aquí. Nunca acepta URLs o nombres externos.
const suffix=randomBytes(6).toString('hex'), owner=`lw_review_owner_${suffix}`;
const databases=[`lawware_test_${randomBytes(6).toString('hex')}`,`lawware_test_${randomBytes(6).toString('hex')}`];
const canonical=['sql/baseline/LawWare_v2_00_esquema.sql','sql/baseline/LawWare_v2_01_integridad.sql','sql/baseline/LawWare_v2_02_seguridad_rls.sql','sql/migrations/v2.1/01_migracion_trazabilidad_auditoria_v2_1.sql'];
const technical=['lawware_app','lawware_auth_service','lawware_editor_service','lawware_grading_service','lawware_progress_service','lawware_privacy_service','lawware_admin_service','lawware_audit_writer'];
const root=resolve('../LawWare-database'), psql=process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe':'psql';
const admin=new pg.Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'});
const created=[]; let ownerCreated=false, verified=false;
function run(command,args,env,cwd) { const result=spawnSync(command,args,{env,cwd,encoding:'utf8'}); if(result.status!==0) throw new Error(`Fallo ${args.join(' ')}\n${result.stdout}\n${result.stderr}`); return result.stdout; }
try {
  await admin.connect(); const dataDir=(await admin.query('SHOW data_directory')).rows[0]?.data_directory;
  if(!dataDir || await realpath(dataDir)!==await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster no autorizado');
  verified=true;
  console.log('PostgreSQL:',(await admin.query('SELECT version() AS v')).rows[0].v);
  for(const file of canonical) { const bytes=await readFile(resolve(root,file)); console.log('SHA256',createHash('sha256').update(bytes).digest('hex'),file); }
  const draft=resolve('docs/proposals/02_vertical_academico_BORRADOR.sql'); console.log('SHA256',createHash('sha256').update(await readFile(draft)).digest('hex'),'borrador');
  const existing=await admin.query('SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])',[technical]); if(existing.rowCount!==technical.length) throw new Error('No existen todos los roles técnicos del clúster de pruebas');
  await admin.query(`CREATE ROLE "${owner}" LOGIN CREATEROLE NOSUPERUSER NOCREATEDB NOBYPASSRLS`); ownerCreated=true;
  await admin.query(`GRANT ${technical.join(',')} TO "${owner}" WITH SET TRUE`);
  for(const [index,db] of databases.entries()) {
    await admin.query(`CREATE DATABASE "${db}" OWNER "${owner}"`); created.push(db);
    const env={...process.env,PGHOST:'127.0.0.1',PGPORT:'55439',PGUSER:owner,PGDATABASE:db,PSQL:psql,PYTHONUTF8:'1'};
    for(const key of ['PGHOSTADDR','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSWORD','PGPASSFILE']) delete env[key];
    for(const file of canonical) run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve(root,file)],env,root);
    if(index===1) run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',draft],env,root);
    console.log(index===0?'BASE CANÓNICA':'BASE CON BORRADOR','instalación correcta');
    for(const file of ['tests/adversarial/02_pruebas_adversariales_trazabilidad_v2_1.sql','tests/integration/06_pruebas_roles_runtime.sql']) { run(psql,['-X','-q','-v','ON_ERROR_STOP=1','-f',resolve(root,file)],env,root); console.log('OK SQL',file); }
    for(const suite of ['tests/security/casos_independientes.py','tests/privacy/casos_independientes.py','tests/audit/casos_independientes.py']) {
      const names=run('python',[suite,'--list'],env,root).trim().split(/\r?\n/).filter(Boolean);
      for(const name of names) run('python',[suite,'--case',name],env,root);
      run('python',[suite,'--reverse'],env,root);
      console.log('OK suite',suite,`${names.length} casos individuales + orden inverso`);
    }
  }
} catch(error) { console.error(error instanceof Error ? error.message : 'Fallo de auditoría'); process.exitCode=1; }
finally {
  if(verified) {
    try { for(const db of created) await admin.query(`DROP DATABASE "${db}" WITH (FORCE)`); if(ownerCreated) await admin.query(`DROP ROLE "${owner}"`); }
    catch { console.error(`Limpieza incompleta; revisar bases ${created.join(', ')} y rol ${owner}`); process.exitCode=1; }
  }
  await admin.end().catch(()=>{});
}
