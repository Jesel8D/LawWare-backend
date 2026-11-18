import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createPool } from '../../src/infrastructure/database/pool.js';
import { withTransaction } from '../../src/infrastructure/database/transaction.js';
import { findByAuth0Sub } from '../../src/modules/auth/infrastructure/user-repository.js';

const authUrl = process.env.LAWWARE_TEST_AUTH_URL;
const appUrl = process.env.LAWWARE_TEST_APP_URL;
const ownerUrl = process.env.LAWWARE_TEST_OWNER_URL;
const mixedUrl = process.env.LAWWARE_TEST_MIXED_URL;
const enabled = !!(authUrl && appUrl && ownerUrl && mixedUrl);
const a = '90000000-0000-4000-8000-000000000001';
const b = '90000000-0000-4000-8000-000000000002';
const ctx = (userId?: string) => ({ requestId: 'aa000000-0000-4000-8000-000000000001', correlationId: 'bb000000-0000-4000-8000-000000000001',
  service: 'lawware-api' as const, ...(userId ? { userId } : {}) });
const issuer = 'https://fixture.auth0.invalid/';
const audience = 'https://api.example.invalid';
let authPool: pg.Pool;
let appPool: pg.Pool;
let ownerPool: pg.Pool;
let mixedPool: pg.Pool;
let privateKey: CryptoKey;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

describe.skipIf(!enabled)('PostgreSQL 17 local integration with separate technical logins', () => {
  beforeAll(async () => {
    for (const connection of [authUrl, appUrl, ownerUrl, mixedUrl]) {
      const url = new URL(connection!);
      if (url.hostname !== '127.0.0.1' || url.port !== '55439' || !/^\/lawware_backend_test_[a-f0-9]{12}$/.test(url.pathname)) {
        throw new Error('Integration tests require a disposable local database');
      }
    }
    const admin = new pg.Client({ host: '127.0.0.1', port: 55439, user: 'postgres', database: 'postgres' });
    await admin.connect();
    try {
      const dataDirectory = (await admin.query<{ data_directory: string }>('SHOW data_directory')).rows[0]?.data_directory;
      const expected = resolve(process.cwd(), '../_local/temporary/pg-local');
      if (!dataDirectory || await realpath(dataDirectory) !== await realpath(expected)) throw new Error('Unexpected cluster');
    } finally { await admin.end(); }
    authPool = createPool(authUrl!, 2);
    appPool = createPool(appUrl!, 1);
    ownerPool = createPool(ownerUrl!, 1);
    mixedPool = createPool(mixedUrl!, 1);
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  });
  afterAll(async () => { await Promise.all([authPool?.end(), appPool?.end(), ownerPool?.end(), mixedPool?.end()]); });

  it('resolves Auth0 subjects using the auth service and does not expose other IDs', async () => {
    const context = { requestId: ctx().requestId, correlationId: ctx().correlationId, service: 'lawware-auth' as const };
    expect(await findByAuth0Sub(authPool, 'auth0|fixture-a', context)).toEqual({ id_usuario: a, estado: 'ACTIVO' });
    expect(await findByAuth0Sub(authPool, 'auth0|unknown', context)).toBeNull();
  });
  it('runs authenticated HTTP requests concurrently for two users against real PostgreSQL', async () => {
    const config = loadConfig({ NODE_ENV: 'test', AUTH0_ISSUER_BASE_URL: issuer, AUTH0_AUDIENCE: audience, AUTH0_CLIENT_ID: 'fixture-client' });
    const oidcFetch: typeof fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${issuer}.well-known/openid-configuration`) return Response.json({ issuer, jwks_uri: `${issuer}.well-known/jwks.json`, authorization_endpoint: `${issuer}authorize`, token_endpoint: `${issuer}oauth/token` });
      if (url === `${issuer}.well-known/jwks.json`) return Response.json({ keys: [publicJwk] });
      throw new Error('Unexpected test request');
    };
    const token = (sub: string) => new SignJWT().setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(issuer).setAudience(audience).setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    const app = createApp(config, { authPool, appPool, oidcFetch, logger: { info() {}, error() {} } });
    const [ta, tb, blocked, inactive, missing] = await Promise.all([
      token('auth0|fixture-a'), token('auth0|fixture-b'), token('auth0|fixture-blocked'),
      token('auth0|fixture-inactive'), token('auth0|fixture-missing'),
    ]);
    const [ra, rb, rc, rd, re] = await Promise.all([
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${ta}`).set('X-User-Id', b),
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${tb}`).query({ id_usuario: a }),
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${blocked}`),
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${inactive}`),
      request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${missing}`),
    ]);
    expect([ra.status, rb.status, rc.status, rd.status, re.status]).toEqual([200, 200, 403, 403, 403]);
    expect([ra.body.id_usuario, rb.body.id_usuario]).toEqual([a, b]);
    if (!process.env.LAWWARE_TEST_PROGRESS_URL) {
      const unavailable=await request(app).get('/api/v1/auth/capabilities').set('Authorization',`Bearer ${ta}`);
      expect(unavailable.status).toBe(503);
      expect(unavailable.body.error).toBe('CAPABILITIES_UNAVAILABLE');
    }
  });
  it('reuses one connection without leaking RLS context across users', async () => {
    const read = (id: string) => withTransaction(appPool, 'lawware_app', ctx(id), async (client) => {
      const result = await client.query<{ id_usuario: string; pid: number }>('SELECT id_usuario, pg_backend_pid() AS pid FROM lawware.usuario');
      return result.rows;
    });
    const [one, two] = await Promise.all([read(a), read(b)]);
    expect(one.map((row) => row.id_usuario)).toEqual([a]);
    expect(two.map((row) => row.id_usuario)).toEqual([b]);
    expect(one[0]?.pid).toBe(two[0]?.pid);
    const connection = await appPool.connect();
    try {
      const result = await connection.query<{ context: string | null; request_id: string | null; correlation: string | null; service: string | null }>(
        "SELECT nullif(current_setting('app.user_id',true),'') AS context, nullif(current_setting('app.request_id',true),'') AS request_id, nullif(current_setting('app.correlation_id',true),'') AS correlation, nullif(current_setting('app.service',true),'') AS service");
      expect(result.rows[0]).toEqual({ context: null, request_id: null, correlation: null, service: null });
    } finally { connection.release(); }
  });
  it('clears a contaminated session value before returning a reused connection', async () => {
    const client = await appPool.connect();
    try { await client.query("SELECT set_config('app.user_id',$1,false)", [b]); } finally { client.release(); }
    await withTransaction(appPool, 'lawware_app', ctx(a), async (c) => {
      const result = await c.query<{ id_usuario: string }>('SELECT id_usuario FROM lawware.usuario');
      expect(result.rows.map((row) => row.id_usuario)).toEqual([a]);
    });
    const reused = await appPool.connect();
    try { expect((await reused.query("SELECT nullif(current_setting('app.user_id',true),'') AS context")).rows[0].context).toBeNull(); }
    finally { reused.release(); }
  });
  it('rolls back writes and rejects cross-user RLS inserts', async () => {
    await expect(withTransaction(appPool, 'lawware_app', ctx(a), async (client) => {
      await client.query("INSERT INTO lawware.solicitud_privacidad(id_usuario,tipo) VALUES($1,'ACCESO')", [a]);
      throw new Error('rollback synthetic');
    })).rejects.toThrow('rollback synthetic');
    const reused = await appPool.connect();
    try { expect((await reused.query("SELECT nullif(current_setting('app.user_id',true),'') AS context")).rows[0].context).toBeNull(); }
    finally { reused.release(); }
    const count = await withTransaction(appPool, 'lawware_app', ctx(a), async (client) =>
      (await client.query<{ n: string }>('SELECT count(*) AS n FROM lawware.solicitud_privacidad')).rows[0]?.n);
    expect(count).toBe('0');
    await expect(withTransaction(appPool, 'lawware_app', ctx(a), async (client) => {
      await client.query("INSERT INTO lawware.solicitud_privacidad(id_usuario,tipo) VALUES($1,'ACCESO')", [b]);
    })).rejects.toThrow();
  });
  it('rejects the schema owner and the wrong technical service as runtime identities', async () => {
    await expect(withTransaction(ownerPool, 'lawware_app', ctx(a), async () => 1)).rejects.toThrow('Identidad PostgreSQL no autorizada');
    await expect(withTransaction(authPool, 'lawware_app', ctx(a), async () => 1)).rejects.toThrow('Identidad PostgreSQL no autorizada');
    await expect(withTransaction(mixedPool, 'lawware_app', ctx(a), async () => 1)).rejects.toThrow('Identidad PostgreSQL no autorizada');
  });
});
