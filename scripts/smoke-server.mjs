/* global fetch */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import process from 'node:process';
import console from 'node:console';

const probe = createServer();
await new Promise((resolveListen) => probe.listen(0, '127.0.0.1', resolveListen));
const address = probe.address();
if (!address || typeof address === 'string') throw new Error('No se obtuvo puerto local');
const port = address.port;
await new Promise((resolveClose) => probe.close(resolveClose));
const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), HOST: '127.0.0.1', DOTENV_CONFIG_PATH: resolve('dist/.env.smoke-do-not-create') };
for (const key of ['AUTH0_ISSUER_BASE_URL', 'AUTH0_AUDIENCE', 'AUTH0_CLIENT_ID', 'AUTH_DATABASE_URL', 'APP_DATABASE_URL', 'CORS_ORIGINS']) delete env[key];
const child = spawn(process.execPath, [resolve('dist/server.js')], { env, stdio: 'ignore' });
try {
  let response;
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error('El servidor terminó antes de responder');
    try { response = await fetch(`http://127.0.0.1:${port}/health`); break; }
    catch { await delay(100); }
  }
  if (!response || response.status !== 200 || (await response.json()).status !== 'ok') throw new Error('Falló /health');
  const protectedResponse = await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`);
  if (protectedResponse.status !== 401) throw new Error('Ruta protegida sin token no devolvió 401');
  console.log('OK: proceso HTTP iniciado, /health responde y Auth rechaza sin token');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
    child.kill('SIGTERM');
    await exited;
  }
}
