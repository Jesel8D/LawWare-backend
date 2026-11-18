import type pg from 'pg';
import { HttpError } from '../../../shared/errors/http-error.js';

// Proposed application permission codes. Undefined codes never grant capabilities.
const known = ['ACADEMIC_READ', 'ACADEMIC_PROGRESS', 'CONTENT_MANAGE', 'ADMIN_ACCESS', 'PRIVACY_NOTICE_READ'] as const;
export type Capability = typeof known[number];
export async function capabilities(client: pg.PoolClient): Promise<{ roles: string[]; capabilities: Capability[] }> {
  let result: pg.QueryResult<{ rol_codigo: string; permiso_codigo: string | null }>;
  try { result = await client.query('SELECT rol_codigo, permiso_codigo FROM lawware.fn_permisos_propios()'); }
  catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42883') throw new HttpError(503, 'CAPABILITIES_UNAVAILABLE'); throw error; }
  const roles = [...new Set(result.rows.map(row => row.rol_codigo))].sort();
  const permissions = new Set(result.rows.map(row => row.permiso_codigo));
  return { roles, capabilities: known.filter(code => permissions.has(code)) };
}
export async function requireCapability(client: pg.PoolClient, code: Capability): Promise<void> {
  if (!(await capabilities(client)).capabilities.includes(code)) throw new HttpError(403, 'FORBIDDEN');
}
