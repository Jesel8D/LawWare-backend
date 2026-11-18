import type { ErrorRequestHandler } from 'express';
import { HttpError } from '../shared/errors/http-error.js';

export type SecurityLogger = { info: (fields: object) => void; error: (fields: object) => void };
const diagnosticCodes = new Set(['AUTH_UNAVAILABLE', 'IDENTITY_STORE_UNAVAILABLE', 'APPLICATION_STORE_UNAVAILABLE', 'PROGRESS_STORE_UNAVAILABLE', 'CAPABILITIES_UNAVAILABLE', 'PRIVACY_NOT_AVAILABLE']);

export function errorHandler(logger: SecurityLogger): ErrorRequestHandler {
  return (error: unknown, _req, res, _next) => {
    let status = error instanceof HttpError ? error.status : 500;
    let code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
    if (typeof error === 'object' && error !== null && 'type' in error) {
      if (error.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; }
      if (error.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; }
    }
    // A 401 may also indicate unavailable discovery/JWKS, so do not label it
    // conclusively as a malicious or invalid token.
    const event = { event: status === 401 ? 'auth.unverified' : status === 403 ? 'security.denied' : 'request.failed',
      status, ...(diagnosticCodes.has(code) ? { error_code: code } : {}),
      request_id: res.locals.requestId, correlation_id: res.locals.correlationId };
    if (status >= 500) logger.error(event); else logger.info(event);
    if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(status).json({ error: code, requestId: res.locals.requestId });
  };
}
