import { createServer } from 'node:http';
import type pg from 'pg';
import { expect, it, vi } from 'vitest';
import { closeServer } from '../../src/infrastructure/shutdown.js';

it('closes the HTTP listener and database pools', async () => {
  const server = createServer((_req, res) => { res.end('ok'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const end = vi.fn(async () => {});
  await closeServer(server, [{ end } as unknown as pg.Pool]);
  expect(server.listening).toBe(false);
  expect(end).toHaveBeenCalledOnce();
});
