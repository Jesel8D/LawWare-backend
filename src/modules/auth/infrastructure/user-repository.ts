import type pg from 'pg';
import { withTransaction, type TransactionContext } from '../../../infrastructure/database/transaction.js';

export type InternalUser = { id_usuario: string; estado: string };

export async function findByAuth0Sub(pool: pg.Pool, sub: string, context: TransactionContext): Promise<InternalUser | null> {
  return withTransaction(pool, 'lawware_auth_service', context, async (client) => {
    const result = await client.query<InternalUser>(
      'SELECT id_usuario, estado FROM lawware.usuario WHERE auth0_id = $1', [sub],
    );
    return result.rows[0] ?? null;
  });
}
