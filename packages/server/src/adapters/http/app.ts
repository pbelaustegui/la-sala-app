import { Hono } from 'hono';
import { z } from 'zod';
import { createPistes, MAX_PISTES } from '../../application/create-pistes';
import type { Clock, PinGenerator, PisteRepository } from '../../application/ports';
import { requireAdmin } from './auth';

export interface AppDeps {
  /** Organizer secret, read from the environment at startup. Never logged or echoed. */
  readonly adminPin: string;
  readonly repository: PisteRepository;
  readonly pinGenerator: PinGenerator;
  readonly clock: Clock;
}

const createPistesBody = z.object({ count: z.number().int().min(1).max(MAX_PISTES) });

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const admin = new Hono();
  admin.use('*', requireAdmin(deps.adminPin));

  admin.get('/pistes', async (c) => c.json(await deps.repository.listPistes()));

  admin.post('/pistes', async (c) => {
    const body = createPistesBody.safeParse(await c.req.json().catch(() => undefined));
    if (!body.success) return c.json({ error: 'invalid-request', issues: body.error.issues }, 400);
    const pistes = await createPistes(deps, body.data.count);
    return c.json(pistes, 201);
  });

  app.route('/admin', admin);
  return app;
}
