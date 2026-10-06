import { Hono } from 'hono';
import { BoutService } from '../../application/bouts';
import { createPistes } from '../../application/create-pistes';
import type { Clock, PinGenerator, PisteRepository } from '../../application/ports';
import { requireAdmin, requirePistePin } from './auth';
import { createPistesBody, startBoutBody, submitEventsBody, toSetup, toStoredEvents } from './schemas';

export interface AppDeps {
  /** Organizer secret, read from the environment at startup. Never logged or echoed. */
  readonly adminPin: string;
  readonly repository: PisteRepository;
  readonly pinGenerator: PinGenerator;
  readonly clock: Clock;
}

const readJson = (request: Request) => request.json().catch(() => undefined);

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const bouts = new BoutService(deps);
  const requirePiste = requirePistePin(deps.repository);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const admin = new Hono();
  admin.use('*', requireAdmin(deps.adminPin));

  admin.get('/pistes', async (c) => c.json(await deps.repository.listPistes()));

  admin.post('/pistes', async (c) => {
    const body = createPistesBody.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: 'invalid-request', issues: body.error.issues }, 400);
    return c.json(await createPistes(deps, body.data.count), 201);
  });

  app.route('/admin', admin);

  app.get('/pistes', async (c) => c.json(await bouts.listPisteStatuses()));

  app.get('/pistes/:id/state', async (c) => {
    const result = await bouts.getSnapshot(c.req.param('id'));
    return result.ok ? c.json(result.snapshot) : c.json({ error: result.reason }, 404);
  });

  app.post('/pistes/:id/bout', requirePiste, async (c) => {
    const body = startBoutBody.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: 'invalid-request', issues: body.error.issues }, 400);
    const result = await bouts.startBout(c.req.param('id'), toSetup(body.data));
    return result.ok ? c.json(result.snapshot, 201) : c.json({ error: result.reason }, 404);
  });

  app.post('/pistes/:id/events', requirePiste, async (c) => {
    const body = submitEventsBody.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: 'invalid-request', issues: body.error.issues }, 400);
    const result = await bouts.submitEvents(c.req.param('id'), toStoredEvents(body.data));
    if (result.ok) return c.json(result.snapshot);
    if (result.reason === 'domain-error') return c.json({ index: result.index, error: result.error }, 422);
    return c.json({ error: result.reason }, result.reason === 'no-bout' ? 409 : 404);
  });

  return app;
}
