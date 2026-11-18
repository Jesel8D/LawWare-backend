import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export const requestContext: RequestHandler = (_req, res, next) => {
  // Server-generated identifiers; incoming headers are never trusted.
  res.locals.requestId = randomUUID();
  res.locals.correlationId = randomUUID();
  res.setHeader('X-Request-Id', res.locals.requestId as string);
  next();
};
