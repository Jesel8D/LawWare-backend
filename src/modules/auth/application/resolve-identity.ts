import type { InternalUser } from '../infrastructure/user-repository.js';
import { HttpError } from '../../../shared/errors/http-error.js';

export function requireActiveUser(user: InternalUser | null): InternalUser {
  if (!user || user.estado !== 'ACTIVO') throw new HttpError(403, 'FORBIDDEN');
  return user;
}
