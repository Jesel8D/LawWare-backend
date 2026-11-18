import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import { createAuth0Api } from '@auth0/auth0-express-api';
import type pg from 'pg';
import { z } from 'zod';
import type { AppConfig } from './config/env.js';
import { requestContext } from './middleware/request-context.js';
import { authenticate } from './middleware/authentication.js';
import { errorHandler, type SecurityLogger } from './middleware/error-handler.js';
import { HttpError } from './shared/errors/http-error.js';
import { findByAuth0Sub } from './modules/auth/infrastructure/user-repository.js';
import { requireActiveUser } from './modules/auth/application/resolve-identity.js';
import { withTransaction } from './infrastructure/database/transaction.js';
import { capabilities } from './modules/authorization/application/capabilities.js';
import { listModules, listLessons, lesson, progress, saveProgress } from './modules/academic/infrastructure/academic-repository.js';

type Dependencies = { authPool?: pg.Pool; appPool?: pg.Pool; progressPool?: pg.Pool; oidcFetch?: typeof fetch; logger?: SecurityLogger };

export function createApp(config: AppConfig, deps: Dependencies = {}): express.Express {
  const app = express();
  const logger = deps.logger ?? pino({ level: 'info' });
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use((req, res, next) => {
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(req.method) ? req.method : 'OTHER';
    res.once('finish', () => logger.info({ event: 'request.completed', method,
      status: res.statusCode, request_id: res.locals.requestId, correlation_id: res.locals.correlationId }));
    next();
  });
  app.use(helmet());
  app.use(cors({ origin(origin, callback) { callback(null, !!origin && config.corsOrigins.includes(origin)); } }));
  app.use(express.json({ limit: '32kb' }));
  app.get('/health', (_req, res) => { res.json({ status: 'ok' }); });
  app.use('/api/v1', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  if (config.auth) {
    app.use('/api/v1', createAuth0Api({ domain: config.auth.domain, audience: config.auth.audience,
      ...(deps.oidcFetch ? { customFetch: deps.oidcFetch } : {}) }));
  }
  const identity: express.RequestHandler = async (_req, res, next) => {
    if (!deps.authPool) throw new HttpError(503, 'IDENTITY_STORE_UNAVAILABLE');
    const user = requireActiveUser(await findByAuth0Sub(deps.authPool, res.locals.verifiedSub as string, {
      requestId: res.locals.requestId as string, correlationId: res.locals.correlationId as string, service: 'lawware-auth',
    }));
    res.locals.internalUser = user;
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
  app.get('/api/v1/auth/me', authenticate(config), identity, (_req, res) => {
    res.json(res.locals.internalUser);
  });
  const appTransaction = async <T>(res: express.Response, operation: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
    if (!deps.appPool) throw new HttpError(503, 'APPLICATION_STORE_UNAVAILABLE');
    return withTransaction(deps.appPool, 'lawware_app', { requestId: res.locals.requestId as string, correlationId: res.locals.correlationId as string, service: 'lawware-api', userId: (res.locals.internalUser as { id_usuario: string }).id_usuario }, operation);
  };
  const protectedRoute = [authenticate(config), identity];
  const uuid = (value: string) => { if (!z.string().uuid().safeParse(value).success) throw new HttpError(400, 'INVALID_ID'); return value; };
  app.get('/api/v1/auth/capabilities', ...protectedRoute, async (_req, res) => { res.json(await appTransaction(res, capabilities)); });
  app.get('/api/v1/academic/modules', ...protectedRoute, async (_req, res) => { res.json({ items: await appTransaction(res, listModules) }); });
  app.get('/api/v1/academic/modules/:id/lessons', ...protectedRoute, async (req, res) => { const id = uuid(req.params.id as string); res.json({ items: await appTransaction(res, c => listLessons(c, id)) }); });
  app.get('/api/v1/academic/lessons/:id', ...protectedRoute, async (req, res) => { const id = uuid(req.params.id as string); res.json(await appTransaction(res, c => lesson(c, id))); });
  app.get('/api/v1/academic/progress', ...protectedRoute, async (_req, res) => { const id = (res.locals.internalUser as { id_usuario: string }).id_usuario; res.json({ items: await appTransaction(res, c => progress(c, id)) }); });
  app.get('/api/v1/privacy/notices/current', ...protectedRoute, (_req, _res) => { throw new HttpError(503, 'PRIVACY_NOT_AVAILABLE'); });
  app.post('/api/v1/academic/lessons/:id/progress', ...protectedRoute, async (req, res) => {
    const id = uuid(req.params.id as string);
    const parsed = z.object({ estado: z.enum(['EN_PROGRESO', 'COMPLETADA']) }).strict().safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, 'INVALID_INPUT');
    if (!deps.progressPool) throw new HttpError(503, 'PROGRESS_STORE_UNAVAILABLE');
    const userId = (res.locals.internalUser as { id_usuario: string }).id_usuario;
    const result = await withTransaction(deps.progressPool, 'lawware_progress_service', { requestId: res.locals.requestId as string, correlationId: res.locals.correlationId as string, service: 'lawware-api', userId }, c => saveProgress(c, userId, id, parsed.data.estado));
    res.json(result);
  });
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND')));
  app.use(errorHandler(logger));
  return app;
}
