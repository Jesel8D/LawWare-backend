import type { RequestHandler } from 'express';
import type { AppConfig } from '../config/env.js';
import { HttpError } from '../shared/errors/http-error.js';

export function authenticate(config: AppConfig): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.header('authorization') ?? '');
    if (!match?.[1]) return next(new HttpError(401, 'UNAUTHENTICATED'));
    if (!config.auth) return next(new HttpError(503, 'AUTH_UNAVAILABLE'));
    try {
      // Auth0 SDK performs discovery, signature, issuer, audience, iat and exp checks.
      const claims = await req.auth0.client.verifyAccessToken({
        accessToken: match[1], requiredClaims: ['sub'], algorithms: ['RS256'],
      });
      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      if (claims.iss !== config.auth.issuer || typeof claims.sub !== 'string' ||
          !claims.sub.trim() || claims.sub.length > 255 ||
          Array.from(claims.sub).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
          typeof claims.iat !== 'number' || claims.iat > Math.floor(Date.now() / 1000) + 60 ||
          typeof claims.exp !== 'number' || audience.includes(config.auth.clientId)) {
        throw new Error('Invalid claims');
      }
      res.locals.verifiedSub = claims.sub;
      return next();
    } catch {
      return next(new HttpError(401, 'UNAUTHENTICATED'));
    }
  };
}
