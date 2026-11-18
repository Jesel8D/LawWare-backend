import { z } from 'zod';

const nonempty = z.string().trim().min(1).optional();
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.enum(['127.0.0.1', '::1', '0.0.0.0', '::']).default('127.0.0.1'),
  CORS_ORIGINS: z.string().default(''),
  AUTH0_ISSUER_BASE_URL: nonempty,
  AUTH0_AUDIENCE: nonempty,
  AUTH0_CLIENT_ID: nonempty,
  AUTH_DATABASE_URL: nonempty,
  APP_DATABASE_URL: nonempty,
  PROGRESS_DATABASE_URL: nonempty,
});

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: '127.0.0.1' | '::1' | '0.0.0.0' | '::';
  corsOrigins: string[];
  auth?: { domain: string; issuer: string; audience: string; clientId: string };
  authDatabaseUrl?: string;
  appDatabaseUrl?: string;
  progressDatabaseUrl?: string;
};

function clean(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

export function loadConfig(source: NodeJS.ProcessEnv): AppConfig {
  const input = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, clean(value)]));
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('Configuración de entorno inválida');
  const e = parsed.data;
  const origins = e.CORS_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean);
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error('Origen CORS inválido'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error('Origen CORS inválido');
    }
  }
  const configured = [e.AUTH0_ISSUER_BASE_URL, e.AUTH0_AUDIENCE, e.AUTH0_CLIENT_ID].filter(Boolean).length;
  if (configured !== 0 && configured !== 3) throw new Error('Configuración Auth0 incompleta');
  let auth: AppConfig['auth'];
  if (e.AUTH0_ISSUER_BASE_URL && e.AUTH0_AUDIENCE && e.AUTH0_CLIENT_ID) {
    let issuer: URL;
    try { issuer = new URL(e.AUTH0_ISSUER_BASE_URL); } catch { throw new Error('Emisor Auth0 inválido'); }
    if (issuer.protocol !== 'https:' || issuer.pathname !== '/' || issuer.search || issuer.hash || issuer.username || issuer.password) {
      throw new Error('Emisor Auth0 debe ser un origen HTTPS');
    }
    if (e.AUTH0_AUDIENCE === e.AUTH0_CLIENT_ID) throw new Error('La audiencia API debe ser distinta del cliente');
    auth = { domain: issuer.host, issuer: issuer.origin + '/', audience: e.AUTH0_AUDIENCE, clientId: e.AUTH0_CLIENT_ID };
  }
  for (const value of [e.AUTH_DATABASE_URL, e.APP_DATABASE_URL, e.PROGRESS_DATABASE_URL]) {
    if (value) {
      let url: URL;
      try { url = new URL(value); } catch { throw new Error('URL PostgreSQL inválida'); }
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname || url.pathname === '/') {
        throw new Error('URL PostgreSQL inválida');
      }
    }
  }
  if (e.AUTH_DATABASE_URL && e.APP_DATABASE_URL && e.AUTH_DATABASE_URL === e.APP_DATABASE_URL) {
    throw new Error('Las identidades técnicas de Auth y aplicación deben ser distintas');
  }
  if (e.PROGRESS_DATABASE_URL && [e.AUTH_DATABASE_URL, e.APP_DATABASE_URL].includes(e.PROGRESS_DATABASE_URL)) throw new Error('La identidad de progreso debe ser distinta');
  if (e.NODE_ENV === 'production' && (!auth || !e.AUTH_DATABASE_URL || !e.APP_DATABASE_URL || !origins.length)) {
    throw new Error('Configuración de producción incompleta');
  }
  return {
    nodeEnv: e.NODE_ENV, port: e.PORT, host: e.HOST, corsOrigins: origins,
    ...(auth ? { auth } : {}),
    ...(e.AUTH_DATABASE_URL ? { authDatabaseUrl: e.AUTH_DATABASE_URL } : {}),
    ...(e.APP_DATABASE_URL ? { appDatabaseUrl: e.APP_DATABASE_URL } : {}),
    ...(e.PROGRESS_DATABASE_URL ? { progressDatabaseUrl: e.PROGRESS_DATABASE_URL } : {}),
  };
}
