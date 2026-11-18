import { beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type pg from 'pg';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';

const issuer = 'https://fixture.auth0.invalid/';
const audience = 'https://api.example.invalid';
const clientId = 'fixture-client';
const config = loadConfig({ NODE_ENV: 'test', AUTH0_ISSUER_BASE_URL: issuer, AUTH0_AUDIENCE: audience, AUTH0_CLIENT_ID: clientId, CORS_ORIGINS: 'https://frontend.example.invalid' });
let privateKey: CryptoKey;
let wrongKey: CryptoKey;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const wrong = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  wrongKey = wrong.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
});

const oidcFetch: typeof fetch = async (input) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === `${issuer}.well-known/openid-configuration`) {
    return Response.json({ issuer, jwks_uri: `${issuer}.well-known/jwks.json`, authorization_endpoint: `${issuer}authorize`, token_endpoint: `${issuer}oauth/token` });
  }
  if (url === `${issuer}.well-known/jwks.json`) return Response.json({ keys: [publicJwk] });
  throw new Error('Unexpected test request');
};

type TokenOptions = { sub?: string; iss?: string; aud?: string | string[]; exp?: number; iat?: number; nbf?: number; key?: CryptoKey; omitSub?: boolean; omitExp?: boolean };
async function token(options: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT().setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
    .setIssuer(options.iss ?? issuer).setAudience(options.aud ?? audience)
    .setIssuedAt(options.iat ?? Math.floor(Date.now() / 1000));
  if (!options.omitExp) jwt.setExpirationTime(options.exp ?? Math.floor(Date.now() / 1000) + 300);
  if (options.nbf !== undefined) jwt.setNotBefore(options.nbf);
  if (!options.omitSub) jwt.setSubject(options.sub ?? 'auth0|alice');
  return jwt.sign(options.key ?? privateKey);
}

function fakePool(options: { failure?: boolean } = {}) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('pg_catalog.pg_roles')) return { rows: [{ privileged: false, expected_role: true, owner_member: false, cross_role: false }] };
    if (sql.includes('WHERE auth0_id = $1')) {
      if (options.failure) throw new Error('FAKE_SECRET_SHOULD_NOT_LEAK');
      if (params?.[0] === 'auth0|alice') return { rows: [{ id_usuario: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', estado: 'ACTIVO' }] };
      if (params?.[0] === 'auth0|blocked') return { rows: [{ id_usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', estado: 'BLOQUEADO' }] };
      if (params?.[0] === 'auth0|inactive') return { rows: [{ id_usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', estado: 'INACTIVO' }] };
      if (params?.[0] === 'auth0|pending') return { rows: [{ id_usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', estado: 'PENDIENTE_REGISTRO' }] };
      return { rows: [] };
    }
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  return { pool: { connect: vi.fn(async () => client) } as unknown as pg.Pool, query };
}
const quiet = { info: vi.fn(), error: vi.fn() };

describe('HTTP and Auth0 verification with simulated issuer and JWKS', () => {
  it('exposes only process health and fails closed without configuration', async () => {
    const app = createApp(loadConfig({ NODE_ENV: 'test' }), { logger: quiet });
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok' });
    const missing = await request(app).get('/api/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toBe('Bearer');
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer fake')).status).toBe(503);
  });
  it('returns 401 without a token or for malformed tokens', async () => {
    const app = createApp(config, { oidcFetch, logger: quiet });
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer malformed')).status).toBe(401);
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Basic fixture')).status).toBe(401);
  });
  it('rejects incorrect signature, issuer, audience, expiration, claims and ID-token audience', async () => {
    const app = createApp(config, { oidcFetch, logger: quiet });
    const invalid = [
      await token({ key: wrongKey }), await token({ iss: 'https://other.auth0.invalid/' }),
      await token({ aud: 'https://other.example.invalid' }), await token({ exp: Math.floor(Date.now() / 1000) - 60 }),
      await token({ omitSub: true }), await token({ omitExp: true }), await token({ aud: clientId }),
      await token({ aud: [audience, clientId] }), await token({ iat: Math.floor(Date.now() / 1000) + 600 }),
      await token({ nbf: Math.floor(Date.now() / 1000) + 600 }),
      await new SignJWT().setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).setIssuer(issuer)
        .setAudience(audience).setSubject('auth0|alice').setExpirationTime('5m').sign(privateKey),
      await new SignJWT({ sub: 'auth0|alice', iss: issuer, aud: audience, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 })
        .setProtectedHeader({ alg: 'HS256', kid: 'fixture-key' }).sign(new TextEncoder().encode('synthetic-key-for-test-only-32-bytes')),
    ];
    for (const value of invalid) expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${value}`)).status).toBe(401);
  });
  it('returns 403 for missing, blocked and inactive internal users', async () => {
    const { pool } = fakePool();
    const app = createApp(config, { authPool: pool, oidcFetch, logger: quiet });
    for (const sub of ['auth0|missing', 'auth0|blocked', 'auth0|inactive', 'auth0|pending']) {
      expect((await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${await token({ sub })}`)).status).toBe(403);
    }
  });
  it('resolves only the verified subject and ignores client identity inputs', async () => {
    const { pool, query } = fakePool();
    const app = createApp(config, { authPool: pool, oidcFetch, logger: quiet });
    const response = await request(app).get('/api/v1/auth/me?id_usuario=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .set('Authorization', `Bearer ${await token()}`).set('X-User-Id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
      .send({ id_usuario: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id_usuario: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', estado: 'ACTIVO' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('WHERE auth0_id = $1'), ['auth0|alice']);
  });
  it('does not expose internal errors, tokens or sensitive values in responses or logs', async () => {
    const logs: object[] = [];
    const logger = { info: (x: object) => { logs.push(x); }, error: (x: object) => { logs.push(x); } };
    const app = createApp(config, { authPool: fakePool({ failure: true }).pool, oidcFetch, logger });
    const accessToken = await token();
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(500);
    expect(JSON.stringify([response.body, logs])).not.toContain('FAKE_SECRET_SHOULD_NOT_LEAK');
    expect(JSON.stringify([response.body, logs])).not.toContain(accessToken);
  });
  it('reports the identity store dependency after verifying a token without logging the token', async () => {
    const logs: object[] = [];
    const logger = { info: (x: object) => { logs.push(x); }, error: (x: object) => { logs.push(x); } };
    const app = createApp(config, { oidcFetch, logger });
    const accessToken = await token();
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(response.status).toBe(503);
    expect(response.body.error).toBe('IDENTITY_STORE_UNAVAILABLE');
    expect(logs).toContainEqual(expect.objectContaining({ status: 503, error_code: 'IDENTITY_STORE_UNAVAILABLE' }));
    expect(JSON.stringify(logs)).not.toContain(accessToken);
  });
  it('fails closed without treating an unavailable issuer as a proven attack', async () => {
    const logs: object[] = [];
    const logger = { info: (x: object) => { logs.push(x); }, error: (x: object) => { logs.push(x); } };
    const unavailable: typeof fetch = async () => { throw new Error('SENSITIVE_PROVIDER_FAILURE'); };
    const app = createApp(config, { oidcFetch: unavailable, logger });
    const response = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${await token()}`);
    expect(response.status).toBe(401);
    expect(logs).toContainEqual(expect.objectContaining({ event: 'auth.unverified', status: 401 }));
    expect(JSON.stringify([response.body, logs])).not.toContain('SENSITIVE_PROVIDER_FAILURE');
  });
  it('allows only configured CORS origins and ignores caller request IDs', async () => {
    const app = createApp(config, { oidcFetch, logger: quiet });
    const allowed = await request(app).get('/health').set('Origin', 'https://frontend.example.invalid').set('X-Request-Id', 'attacker-chosen');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://frontend.example.invalid');
    expect(allowed.headers['x-request-id']).not.toBe('attacker-chosen');
    const denied = await request(app).get('/health').set('Origin', 'https://other.example.invalid');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
  it('rejects invalid JSON and oversized requests without reflecting their contents', async () => {
    const app = createApp(config, { oidcFetch, logger: quiet });
    const invalid = await request(app).post('/not-found').set('Content-Type', 'application/json').send('{broken');
    expect(invalid.status).toBe(400);
    expect(JSON.stringify(invalid.body)).not.toContain('broken');
    const large = await request(app).post('/not-found').send({ payload: 'x'.repeat(40_000) });
    expect(large.status).toBe(413);
  });
});
