import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type pg from 'pg';
import { createPool } from '../../src/infrastructure/database/pool.js';
import { loadConfig } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { withTransaction } from '../../src/infrastructure/database/transaction.js';
import { saveProgress } from '../../src/modules/academic/infrastructure/academic-repository.js';

const authUrl = process.env.LAWWARE_TEST_AUTH_URL, appUrl = process.env.LAWWARE_TEST_APP_URL, progressUrl = process.env.LAWWARE_TEST_PROGRESS_URL, ownerUrl = process.env.LAWWARE_TEST_OWNER_URL;
const enabled = !!(authUrl && appUrl && progressUrl && ownerUrl);
const issuer = 'https://fixture.auth0.invalid/', audience = 'https://api.example.invalid';
const version = '95000000-0000-4000-8000-000000000001', draft = '95000000-0000-4000-8000-000000000002', moduleId = '93000000-0000-4000-8000-000000000001';
let authPool: pg.Pool, appPool: pg.Pool, progressPool: pg.Pool, ownerPool: pg.Pool, privateKey: CryptoKey;
let jwk: Awaited<ReturnType<typeof exportJWK>>;
let app: ReturnType<typeof createApp>;
const token = (sub: string) => new SignJWT().setProtectedHeader({ alg: 'RS256', kid: 'fixture' }).setIssuer(issuer).setAudience(audience).setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
describe.skipIf(!enabled)('vertical PostgreSQL con borrador SQL aislado y emisor simulado', () => {
  beforeAll(async () => {
    for (const value of [authUrl, appUrl, progressUrl, ownerUrl]) { const url = new URL(value!); if (url.hostname !== '127.0.0.1' || url.port !== '55439' || !/^\/lawware_backend_test_[a-f0-9]{12}$/.test(url.pathname)) throw new Error('Base desechable requerida'); }
    authPool = createPool(authUrl!, 2); appPool = createPool(appUrl!, 1); progressPool = createPool(progressUrl!, 1); ownerPool = createPool(ownerUrl!, 1);
    const pair = await generateKeyPair('RS256'); privateKey = pair.privateKey; jwk = { ...(await exportJWK(pair.publicKey)), kid: 'fixture', alg: 'RS256', use: 'sig' };
    const oidcFetch: typeof fetch = async input => { const url = input instanceof Request ? input.url : String(input); if (url === `${issuer}.well-known/openid-configuration`) return Response.json({ issuer, jwks_uri: `${issuer}.well-known/jwks.json`, authorization_endpoint: `${issuer}authorize`, token_endpoint: `${issuer}oauth/token` }); if (url === `${issuer}.well-known/jwks.json`) return Response.json({ keys: [jwk] }); throw new Error('Unexpected request'); };
    app = createApp(loadConfig({ NODE_ENV: 'test', AUTH0_ISSUER_BASE_URL: issuer, AUTH0_AUDIENCE: audience, AUTH0_CLIENT_ID: 'fixture-client' }), { authPool, appPool, progressPool, oidcFetch, logger: { info() {}, error() {} } });
  });
  afterAll(async () => { await Promise.all([authPool?.end(), appPool?.end(), progressPool?.end(), ownerPool?.end()]); });
  it('resuelve permisos reales acumulados y excluye roles inactivos', async () => {
    const a = await token('auth0|fixture-a'), b = await token('auth0|fixture-b');
    const [one,two] = await Promise.all([request(app).get('/api/v1/auth/capabilities').auth(a,{type:'bearer'}),request(app).get('/api/v1/auth/capabilities').auth(b,{type:'bearer'})]);
    expect(one.status).toBe(200); expect(one.body.roles).toEqual(['AVANCE_PRUEBA','LECTOR_PRUEBA']); expect(one.body.capabilities).toEqual(['ACADEMIC_READ','ACADEMIC_PROGRESS','PRIVACY_NOTICE_READ']);
    expect(two.body.roles).toEqual(['LECTOR_PRUEBA']); expect(two.body.capabilities).toEqual(['ACADEMIC_READ','PRIVACY_NOTICE_READ']);
  });
  it('devuelve solo material publicado y deniega borradores', async () => {
    const a = await token('auth0|fixture-a');
    const modules = await request(app).get('/api/v1/academic/modules').auth(a,{type:'bearer'}); expect(modules.status).toBe(200); expect(modules.body.items).toHaveLength(1);
    const lessons = await request(app).get(`/api/v1/academic/modules/${moduleId}/lessons`).auth(a,{type:'bearer'}); expect(lessons.status).toBe(200); expect(lessons.body.items.map((x: {id_leccion_version:string})=>x.id_leccion_version)).toEqual([version,'95000000-0000-4000-8000-000000000003']);
    expect((await request(app).get(`/api/v1/academic/lessons/${version}`).auth(a,{type:'bearer'})).status).toBe(200);
    expect((await request(app).get(`/api/v1/academic/lessons/${draft}`).auth(a,{type:'bearer'})).status).toBe(404);
  });
  it('persiste avance propio, lo recupera y no lo degrada al repetir', async () => {
    const a = await token('auth0|fixture-a'); const path = `/api/v1/academic/lessons/${version}/progress`;
    expect((await request(app).post(path).auth(a,{type:'bearer'}).send({estado:'EN_PROGRESO'})).status).toBe(200);
    expect((await request(app).post(path).auth(a,{type:'bearer'}).send({estado:'COMPLETADA'})).body.estado).toBe('COMPLETADA');
    expect((await request(app).post(path).auth(a,{type:'bearer'}).send({estado:'EN_PROGRESO'})).body.estado).toBe('COMPLETADA');
    const recovered = await request(app).get('/api/v1/academic/progress').auth(a,{type:'bearer'}); expect(recovered.body.items[0].estado).toBe('COMPLETADA');
    expect((await request(app).post(`/api/v1/academic/lessons/${draft}/progress`).auth(a,{type:'bearer'}).send({estado:'COMPLETADA'})).status).toBe(404);
  });
  it('deniega escritura sin permiso y no acepta identidad arbitraria', async () => {
    const b = await token('auth0|fixture-b'), c = await token('auth0|fixture-c'); const path = `/api/v1/academic/lessons/${version}/progress`;
    expect((await request(app).post(path).auth(b,{type:'bearer'}).send({estado:'COMPLETADA'})).status).toBe(403);
    expect((await request(app).post(path).auth(c,{type:'bearer'}).send({estado:'COMPLETADA',id_usuario:'90000000-0000-4000-8000-000000000001'})).status).toBe(400);
    const before = await request(app).get('/api/v1/academic/progress').auth(c,{type:'bearer'}); expect(before.body.items).toHaveLength(0);
    expect((await request(app).post(path).auth(c,{type:'bearer'}).send({estado:'COMPLETADA'})).status).toBe(200);
    const own = await request(app).get('/api/v1/academic/progress').auth(c,{type:'bearer'}); expect(own.body.items).toHaveLength(1);
  });
  it('deniega sin token y cuenta bloqueada', async () => {
    expect((await request(app).get('/api/v1/academic/modules')).status).toBe(401);
    expect((await request(app).get('/api/v1/academic/modules').auth(await token('auth0|fixture-blocked'),{type:'bearer'})).status).toBe(403);
    expect((await request(app).get('/api/v1/academic/modules').auth(await token('auth0|fixture-missing'),{type:'bearer'})).status).toBe(403);
  });
  it('comprueba permiso insuficiente y separación funcional de dos cuentas', async () => {
    const [a,b,c] = await Promise.all([token('auth0|fixture-a'),token('auth0|fixture-b'),token('auth0|fixture-c')]);
    const path = `/api/v1/academic/lessons/${version}/progress`;
    expect((await request(app).post(path).auth(b,{type:'bearer'}).send({estado:'COMPLETADA'})).status).toBe(403);
    const first = await request(app).get('/api/v1/academic/progress').auth(a,{type:'bearer'});
    const second = await request(app).get('/api/v1/academic/progress').auth(c,{type:'bearer'});
    expect(first.body.items.find((row:{id_leccion_version:string})=>row.id_leccion_version===version)?.estado).toBe('COMPLETADA');
    expect(second.body.items.find((row:{id_leccion_version:string})=>row.id_leccion_version===version)).toBeUndefined();
  });
  it('consulta el aviso y recibe indisponibilidad controlada', async () => {
    const a=await token('auth0|fixture-a');
    const notice=await request(app).get('/api/v1/privacy/notices/current?type=INTEGRAL').auth(a,{type:'bearer'});
    expect(notice.status).toBe(503); expect(notice.body.error).toBe('PRIVACY_NOT_AVAILABLE');
    expect((await request(app).get('/api/v1/privacy/notices/current?type=CORTO').auth(a,{type:'bearer'})).status).toBe(503);
  });
  it('aísla escrituras simultáneas y reutiliza el pool entre dos usuarios', async () => {
    const [a,c]=await Promise.all([token('auth0|fixture-a'),token('auth0|fixture-c')]);
    const other='95000000-0000-4000-8000-000000000003', path=`/api/v1/academic/lessons/${other}/progress`;
    const results=await Promise.all([request(app).post(path).auth(a,{type:'bearer'}).send({estado:'EN_PROGRESO'}),request(app).post(path).auth(c,{type:'bearer'}).send({estado:'COMPLETADA'})]);
    expect(results.map(x=>x.status)).toEqual([200,200]);
    const reads=await Promise.all([request(app).get('/api/v1/academic/progress').auth(a,{type:'bearer'}),request(app).get('/api/v1/academic/progress').auth(c,{type:'bearer'})]);
    expect(reads.map(x=>x.body.items.find((row:{id_leccion_version:string})=>row.id_leccion_version===other).estado)).toEqual(['EN_PROGRESO','COMPLETADA']);
  });
  it('revierte cambios del pool de progreso y elimina el contexto', async () => {
    const other='95000000-0000-4000-8000-000000000003', userId='90000000-0000-4000-8000-000000000001';
    await expect(withTransaction(progressPool,'lawware_progress_service',{requestId:'00000000-0000-4000-8000-000000000001',correlationId:'00000000-0000-4000-8000-000000000002',service:'lawware-api',userId},async client=>{ await saveProgress(client,userId,other,'COMPLETADA'); throw new Error('rollback controlado'); })).rejects.toThrow('rollback controlado');
    const a=await token('auth0|fixture-a'), result=await request(app).get('/api/v1/academic/progress').auth(a,{type:'bearer'});
    expect(result.body.items.find((row:{id_leccion_version:string})=>row.id_leccion_version===other).estado).toBe('EN_PROGRESO');
    const client=await progressPool.connect(); try { expect((await client.query("SELECT nullif(current_setting('app.user_id',true),'') AS context")).rows[0].context).toBeNull(); } finally { client.release(); }
  });
  it('serializa la retirada concurrente de una lección con el avance', async () => {
    const writer = await progressPool.connect(), editor = await ownerPool.connect();
    try {
      await writer.query('BEGIN');
      await writer.query("SELECT set_config('app.user_id',$1,true)", ['90000000-0000-4000-8000-000000000001']);
      expect((await writer.query('SELECT lawware.fn_bloquear_leccion_publicada($1) AS ok',[version])).rows[0].ok).toBe(true);
      let finished = false;
      const retirement = editor.query("UPDATE lawware.leccion_version SET estado='RETIRADA' WHERE id_leccion_version=$1",[version]).then(() => { finished=true; });
      await new Promise(resolve => setTimeout(resolve,100));
      expect(finished).toBe(false);
      await writer.query('COMMIT'); await retirement;
    } finally { await writer.query('ROLLBACK').catch(()=>{}); writer.release(); editor.release(); }
    const a = await token('auth0|fixture-a');
    expect((await request(app).post(`/api/v1/academic/lessons/${version}/progress`).auth(a,{type:'bearer'}).send({estado:'COMPLETADA'})).status).toBe(404);
  });
  it('HALLAZGO: un servicio con SQL arbitrario puede suplantar el GUC y escribir como otro usuario', async () => {
    const otherUser='90000000-0000-4000-8000-000000000002', otherVersion='95000000-0000-4000-8000-000000000003';
    const context={ requestId:'00000000-0000-4000-8000-000000000001',correlationId:'00000000-0000-4000-8000-000000000002',service:'lawware-api' as const,userId:'90000000-0000-4000-8000-000000000001' };
    await expect(withTransaction(progressPool,'lawware_progress_service',context,async client=>{
      await client.query("SELECT set_config('app.user_id',$1,true)",[otherUser]);
      const permissions=await client.query<{permiso_codigo:string|null}>('SELECT permiso_codigo FROM lawware.fn_permisos_propios()');
      expect(permissions.rows.map(row=>row.permiso_codigo)).not.toContain('ACADEMIC_PROGRESS');
      const inserted=await client.query("INSERT INTO lawware.avance_leccion(id_usuario,id_leccion_version,estado) VALUES($1,$2,'EN_PROGRESO') RETURNING id_usuario",[otherUser,otherVersion]);
      expect(inserted.rows[0].id_usuario).toBe(otherUser);
      throw new Error('rollback hallazgo');
    })).rejects.toThrow('rollback hallazgo');
  });
  it('prueba escrituras concurrentes con conexiones PostgreSQL diferentes', async () => {
    const versionId='95000000-0000-4000-8000-000000000003';
    const ids=['90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000005'];
    const pool=createPool(progressUrl!,2); let count=0; let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;});
    try {
      const pids=await Promise.all(ids.map(userId=>withTransaction(pool,'lawware_progress_service',{requestId:'00000000-0000-4000-8000-000000000001',correlationId:'00000000-0000-4000-8000-000000000002',service:'lawware-api',userId},async client=>{
        const pid=(await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid;
        if(pid===undefined) throw new Error('PID de PostgreSQL no disponible');
        count++; if(count===2) release(); await gate;
        await saveProgress(client,userId,versionId,'EN_PROGRESO'); return pid;
      })));
      expect(new Set(pids).size).toBe(2);
    } finally { await pool.end(); }
  });
  it('HALLAZGO: una revocación confirmada después de la comprobación permite la escritura ya iniciada', async () => {
    const userId='90000000-0000-4000-8000-000000000001', versionId='95000000-0000-4000-8000-000000000003';
    let checked!:()=>void, resume!:()=>void, seen=0;
    const ready=new Promise<void>(resolve=>{checked=resolve;}), gate=new Promise<void>(resolve=>{resume=resolve;});
    const operation=withTransaction(progressPool,'lawware_progress_service',{requestId:'00000000-0000-4000-8000-000000000001',correlationId:'00000000-0000-4000-8000-000000000002',service:'lawware-api',userId},async client=>{
      const observed=new Proxy(client,{ get(target,property,receiver) {
        if(property!=='query') return Reflect.get(target,property,receiver);
        return async (...args:unknown[])=>{ const result:unknown=await Reflect.apply(target.query,target,args); if(typeof args[0]==='string' && args[0].includes('fn_permisos_propios') && ++seen===2) { checked(); await gate; } return result; };
      }});
      return saveProgress(observed,userId,versionId,'COMPLETADA');
    });
    try {
      await ready;
      const changed=await ownerPool.query("UPDATE lawware.usuario_rol SET estado='INACTIVO',fecha_fin=clock_timestamp() WHERE id_usuario=$1 AND id_rol='91000000-0000-4000-8000-000000000002'",[userId]);
      expect(changed.rowCount).toBe(1);
    } finally { resume(); }
    expect((await operation).estado).toBe('COMPLETADA');
  });
  it.skipIf(process.env.LAWWARE_TEST_CANDIDATE !== '1')('CANDIDATA mantiene la forma HTTP y deja aviso pendiente', async () => {
    const a=await token('auth0|fixture-a'), other='95000000-0000-4000-8000-000000000003';
    const identity=await request(app).get('/api/v1/auth/me').auth(a,{type:'bearer'});
    expect(identity.status).toBe(200); expect(Object.keys(identity.body).sort()).toEqual(['estado','id_usuario']);
    const caps=await request(app).get('/api/v1/auth/capabilities').auth(a,{type:'bearer'});
    expect(caps.status).toBe(200); expect(Object.keys(caps.body).sort()).toEqual(['capabilities','roles']);
    const modules=await request(app).get('/api/v1/academic/modules').auth(a,{type:'bearer'});
    expect(modules.status).toBe(200); expect(Object.keys(modules.body.items[0]).sort()).toEqual(['descripcion','id_modulo','nivel','orden','titulo']);
    const lessons=await request(app).get(`/api/v1/academic/modules/${moduleId}/lessons`).auth(a,{type:'bearer'});
    expect(lessons.status).toBe(200); expect(Object.keys(lessons.body.items[0]).sort()).toEqual(['id_leccion','id_leccion_version','orden','titulo']);
    const details=await request(app).get(`/api/v1/academic/lessons/${other}`).auth(a,{type:'bearer'});
    expect(details.status).toBe(200); expect(Object.keys(details.body).sort()).toEqual(['contenido','id_leccion','id_leccion_version','id_modulo','titulo']);
    const saved=await request(app).post(`/api/v1/academic/lessons/${other}/progress`).auth(a,{type:'bearer'}).send({estado:'COMPLETADA'});
    expect(saved.status).toBe(200); expect(Object.keys(saved.body).sort()).toEqual(['estado','fecha_completado','fecha_inicio','id_leccion_version']);
    const pending=await request(app).get('/api/v1/privacy/notices/current?type=INTEGRAL').auth(a,{type:'bearer'});
    expect(pending.status).toBe(503); expect(pending.body.error).toBe('PRIVACY_NOT_AVAILABLE');
  });
});
