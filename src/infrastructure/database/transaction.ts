import type pg from 'pg';
import { assertRuntimeRole, type RuntimeRole } from './pool.js';

export type TransactionContext = {
  requestId: string;
  correlationId: string;
  userId?: string;
  service: 'lawware-auth' | 'lawware-api';
};

export async function withTransaction<T>(
  pool: pg.Pool, role: RuntimeRole, context: TransactionContext,
  operation: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let started = false;
  let discard = false;
  try {
    await assertRuntimeRole(client, role);
    await client.query('BEGIN');
    started = true;
    await client.query("SELECT set_config('app.request_id',$1,true), set_config('app.correlation_id',$2,true), set_config('app.service',$3,true)",
      [context.requestId, context.correlationId, context.service]);
    if (role !== 'lawware_auth_service' && !context.userId) throw new Error('Falta identidad verificada para RLS');
    await client.query("SELECT set_config('app.user_id',$1,true)", [context.userId ?? '']);
    const result = await operation(client);
    await client.query('COMMIT');
    started = false;
    return result;
  } catch (error) {
    if (started) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
    } else {
      // A connection failing role checks or BEGIN is not trusted for reuse.
      discard = true;
    }
    throw error;
  } finally {
    // Clear session-level remnants as well as transaction-local values; if
    // cleanup fails, destroy rather than return this connection to the pool.
    if (!discard) {
      try {
        await client.query("SELECT set_config('app.user_id','',false), set_config('app.request_id','',false), set_config('app.correlation_id','',false), set_config('app.service','',false)");
      } catch { discard = true; }
    }
    client.release(discard);
  }
}
