import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

describe('configuration', () => {
  it('starts without external services in development', () => {
    expect(loadConfig({}).auth).toBeUndefined();
  });
  it.each([
    { PORT: '0' }, { PORT: 'invalid' }, { NODE_ENV: 'invalid' },
    { AUTH0_ISSUER_BASE_URL: 'https://issuer.example/' },
    { AUTH0_ISSUER_BASE_URL: 'http://issuer.example/', AUTH0_AUDIENCE: 'api', AUTH0_CLIENT_ID: 'client' },
    { AUTH0_ISSUER_BASE_URL: 'https://issuer.example/path', AUTH0_AUDIENCE: 'api', AUTH0_CLIENT_ID: 'client' },
    { AUTH0_ISSUER_BASE_URL: 'https://issuer.example/', AUTH0_AUDIENCE: 'same', AUTH0_CLIENT_ID: 'same' },
    { CORS_ORIGINS: '*' }, { CORS_ORIGINS: 'https://example.com/path' },
    { AUTH_DATABASE_URL: 'https://example.com/' },
    { NODE_ENV: 'production' },
    { AUTH_DATABASE_URL: 'postgres://a@localhost/db', APP_DATABASE_URL: 'postgres://a@localhost/db' },
  ])('rejects invalid or incomplete settings', (input) => {
    expect(() => loadConfig(input)).toThrow();
  });
  it('accepts an explicit HTTPS issuer and distinct API audience', () => {
    const config = loadConfig({ AUTH0_ISSUER_BASE_URL: 'https://example.auth0.invalid/', AUTH0_AUDIENCE: 'https://api.invalid', AUTH0_CLIENT_ID: 'client', CORS_ORIGINS: 'http://localhost:3000' });
    expect(config.auth?.issuer).toBe('https://example.auth0.invalid/');
    expect(config.corsOrigins).toEqual(['http://localhost:3000']);
  });
});
