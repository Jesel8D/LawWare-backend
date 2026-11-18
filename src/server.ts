import 'dotenv/config';
import pino from 'pino';
import { loadConfig } from './config/env.js';
import { createPool } from './infrastructure/database/pool.js';
import { createApp } from './app.js';
import { closeServer } from './infrastructure/shutdown.js';

const logger = pino();
let config;
try { config = loadConfig(process.env); }
catch { logger.fatal({ event: 'configuration.invalid' }); process.exit(1); }
const authPool = config.authDatabaseUrl ? createPool(config.authDatabaseUrl) : undefined;
const appPool = config.appDatabaseUrl ? createPool(config.appDatabaseUrl) : undefined;
const progressPool = config.progressDatabaseUrl ? createPool(config.progressDatabaseUrl) : undefined;
authPool?.on('error', () => logger.error({ event: 'auth_pool.idle_error' }));
appPool?.on('error', () => logger.error({ event: 'app_pool.idle_error' }));
progressPool?.on('error', () => logger.error({ event: 'progress_pool.idle_error' }));
const app = createApp(config, { ...(authPool ? { authPool } : {}), ...(appPool ? { appPool } : {}), ...(progressPool ? { progressPool } : {}), logger });
const server = app.listen(config.port, config.host, () => logger.info({ event: 'server.listening', port: config.port }));
server.on('error', () => { logger.fatal({ event: 'server.failed' }); process.exitCode = 1; void shutdown(); });
let closing = false;
async function shutdown(): Promise<void> {
  if (closing) return;
  closing = true;
  try {
    await closeServer(server, [authPool, appPool, progressPool].filter((pool) => pool !== undefined));
    logger.info({ event: 'server.stopped' });
  } catch { logger.error({ event: 'shutdown.failed' }); process.exitCode = 1; }
}
process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
