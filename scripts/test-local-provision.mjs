import { spawn, spawnSync } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import pg from 'pg';

const env={...process.env,NODE_ENV:'development',LAWWARE_INIT_LOCAL:'1'};
const created=spawnSync(process.execPath,[resolve('scripts/init-local-lab.mjs')],{env,encoding:'utf8'});
if(created.status!==0) throw new Error('No se pudo crear laboratorio sintético');
const match=/Base sintética: (lawware_dev_synthetic_([a-f0-9]{12}))/.exec(created.stdout);
if(!match) throw new Error('No se identificó el laboratorio generado');
const database=match[1], suffix=match[2];
const roles=[`lw_lab_auth_${suffix}`,`lw_lab_app_${suffix}`,`lw_lab_progress_${suffix}`];
const admin=new pg.Client({host:'127.0.0.1',port:55439,user:'postgres',database:'postgres'});
let verified=false;
try {
  await admin.connect();
  const dir=(await admin.query('SHOW data_directory')).rows[0]?.data_directory;
  if(!dir || await realpath(dir)!==await realpath(resolve('../_local/temporary/pg-local'))) throw new Error('Clúster inesperado');
  verified=true;
  const child=spawn(process.execPath,[resolve('scripts/provision-local-user.mjs')],{env:{...env,LAWWARE_DEV_DATABASE:database},stdio:['pipe','pipe','pipe']});
  let prompts='', step=0;
  child.stderr.on('data',chunk=>{ prompts+=String(chunk); if(step===0 && prompts.includes('UUID')) { step=1; child.stdin.write('90000000-0000-4000-8000-000000000001\n'); } if(step===1 && prompts.includes('Sub verificado')) { step=2; child.stdin.write('auth0|lab-synthetic-check\n'); } if(step===2 && prompts.includes('VINCULAR')) { step=3; child.stdin.write('VINCULAR\n'); } });
  const exit=await new Promise((resolveExit,reject)=>{ const timer=setTimeout(()=>{child.kill();reject(new Error('La prueba de aprovisionamiento excedió el tiempo'));},15000); child.on('error',reject); child.on('exit',code=>{clearTimeout(timer);resolveExit(code);}); });
  if(exit!==0) throw new Error(`Falló el aprovisionamiento sintético en paso ${step}: ${prompts}`);
  const owner=new pg.Client({host:'127.0.0.1',port:55439,user:'lawware_migrador',database}); await owner.connect();
  try { const result=await owner.query("SELECT auth0_id=$1 AS linked, estado='ACTIVO' AS active FROM lawware.usuario WHERE id_usuario=$2",['auth0|lab-synthetic-check','90000000-0000-4000-8000-000000000001']); if(!result.rows[0]?.linked || !result.rows[0]?.active) throw new Error('Vinculación sintética no confirmada'); } finally { await owner.end(); }
  console.log('Aprovisionamiento sintético confirmado sin cambiar estado ni roles.');
} finally {
  if (verified) {
    try { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); for(const role of roles) await admin.query(`DROP ROLE "${role}"`); }
    catch { console.error(`Limpieza incompleta: revisar ${database} y los roles del sufijo ${suffix}.`); process.exitCode=1; }
  } else { console.error(`Clúster no verificado: revisar ${database} y los roles del sufijo ${suffix}.`); process.exitCode=1; }
  await admin.end().catch(()=>{});
}
