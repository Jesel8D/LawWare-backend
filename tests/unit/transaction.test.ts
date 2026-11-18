import { describe, expect, it, vi } from 'vitest';
import type pg from 'pg';
import { withTransaction } from '../../src/infrastructure/database/transaction.js';

function mockedPool(failRollback = false, failCleanup = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('pg_catalog.pg_roles')) return { rows: [{ privileged: false, expected_role: true, owner_member: false, cross_role: false }] };
    if (sql === 'ROLLBACK' && failRollback) throw new Error('rollback failed');
    if (failCleanup && sql.includes("set_config('app.user_id','',false)")) throw new Error('cleanup failed');
    return { rows: [] };
  });
  const release = vi.fn();
  const client = { query, release };
  const pool = { connect: vi.fn(async () => client) } as unknown as pg.Pool;
  return { pool, query, release };
}
const context = { requestId: 'request', correlationId: 'correlation', userId: 'user', service: 'lawware-api' as const };

describe('transaction management', () => {
  it('uses one connection and commits before release', async () => {
    const { pool, query, release } = mockedPool();
    await expect(withTransaction(pool, 'lawware_app', context, async (client) => {
      await client.query('SELECT $1', ['value']); return 42;
    })).resolves.toBe(42);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('pg_catalog.pg_roles'), 'BEGIN', expect.stringContaining("set_config('app.request_id'"),
      expect.stringContaining("set_config('app.user_id'"), 'SELECT $1', 'COMMIT',
      expect.stringContaining("set_config('app.user_id','',false)"),
    ]);
    expect(release).toHaveBeenCalledWith(false);
  });
  it('rolls back and releases on error', async () => {
    const { pool, query, release } = mockedPool();
    await expect(withTransaction(pool, 'lawware_app', context, async () => { throw new Error('test'); })).rejects.toThrow('test');
    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledWith(false);
  });
  it('discards the connection if rollback fails', async () => {
    const { pool, release } = mockedPool(true);
    await expect(withTransaction(pool, 'lawware_app', context, async () => { throw new Error('test'); })).rejects.toThrow('test');
    expect(release).toHaveBeenCalledWith(true);
  });
  it('discards the connection if session cleanup fails after commit', async () => {
    const { pool, release } = mockedPool(false, true);
    await expect(withTransaction(pool, 'lawware_app', context, async () => 42)).resolves.toBe(42);
    expect(release).toHaveBeenCalledWith(true);
  });
  it('rejects an app transaction without an identity', async () => {
    const { pool, query, release } = mockedPool();
    await expect(withTransaction(pool, 'lawware_app', { requestId: 'r', correlationId: 'c', service: 'lawware-api' }, async () => 1)).rejects.toThrow();
    expect(query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
    expect(release).toHaveBeenCalledWith(false);
  });
});
