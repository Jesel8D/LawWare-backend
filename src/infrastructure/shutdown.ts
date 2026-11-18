import type { Server } from 'node:http';
import type pg from 'pg';

export async function closeServer(server: Server, pools: pg.Pool[], timeoutMs = 10_000): Promise<void> {
  const timeout = setTimeout(() => server.closeAllConnections(), timeoutMs).unref();
  let listenerError: unknown;
  try {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  } catch (error) {
    listenerError = error;
  } finally { clearTimeout(timeout); }
  const poolResults = await Promise.allSettled(pools.map((pool) => pool.end()));
  if (listenerError || poolResults.some((result) => result.status === 'rejected')) throw new Error('Shutdown failed');
}
