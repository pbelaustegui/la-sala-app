import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { BoutService } from '../../application/bouts';
import { createPistes } from '../../application/create-pistes';
import type { AttemptLimiter, ChangeHub, Clock, PinGenerator, PisteRepository } from '../../application/ports';
import { MemoryAttemptLimiter } from '../memory/attempt-limiter';
import { InProcessHub } from '../memory/in-process-hub';
import { requireAdmin, requirePistePin } from './auth';
import { createPistesBody, startBoutBody, submitEventsBody, toSetup, toStoredEvents } from './schemas';

export interface AppDeps {
  /** Organizer secret, read from the environment at startup. Never logged or echoed. */
  readonly adminPin: string;
  readonly repository: PisteRepository;
  readonly pinGenerator: PinGenerator;
  readonly clock: Clock;
  /** Fan-out of changes to SSE streams. Defaults to an in-process hub. */
  readonly hub?: ChangeHub;
  /** Throttles wrong judge (piste) PIN guesses. Defaults to an in-memory limiter on `clock`. */
  readonly limiter?: AttemptLimiter;
  /** Interval of SSE keep-alive comments. Defaults to 15 s. */
  readonly heartbeatMs?: number;
}

export const DEFAULT_HEARTBEAT_MS = 15_000;

const readJson = (request: Request) => request.json().catch(() => undefined);

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const hub = deps.hub ?? new InProcessHub();
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const bouts = new BoutService({ repository: deps.repository, clock: deps.clock, hub });
  const limiter = deps.limiter ?? new MemoryAttemptLimiter(deps.clock);
  const requirePiste = requirePistePin(deps.repository, limiter);

  app.get('/health', (c) => c.json({ status: 'ok' }));

  const admin = new Hono();
  admin.use('*', requireAdmin(deps.adminPin));

  admin.get('/pistes', async (c) => c.json(await deps.repository.listPistes()));

  admin.post('/pistes', async (c) => {
    const body = createPistesBody.safeParse(await readJson(c.req.raw));
    if (!body.success) return c.json({ error: 'invalid-request', issues: body.error.issues }, 400);
    const pistes = await createPistes(deps, body.data.count);
    bouts.announcePistesReset(pistes.map((piste) => piste.id));
    return c.json(pistes, 201);
  });

  app.route('/admin', admin);

  app.get('/pistes', async (c) => c.json(await bouts.listPisteStatuses()));

  app.get('/pistes/:id/state', async (c) => {
    const result = await bouts.getSnapshot(c.req.param('id'));
    return result.ok ? c.json(result.snapshot) : c.json({ error: result.reason }, 404);
  });

  app.get('/pistes/:id/stream', async (c) => {
    const pisteId = c.req.param('id');
    const initial = await bouts.getSnapshot(pisteId);
    if (!initial.ok) return c.json({ error: initial.reason }, 404);

    return streamSSE(c, async (stream) => {
      const send = (snapshot: unknown) =>
        stream.writeSSE({ event: 'snapshot', data: JSON.stringify(snapshot) }).catch(() => undefined);
      // Subscribe before the first write so no change falls between snapshot and stream.
      const unsubscribe = hub.subscribe(pisteId, (snapshot) => void send(snapshot));
      const heartbeat = setInterval(() => void stream.write(': heartbeat\n\n').catch(() => undefined), heartbeatMs);
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve));
      try {
        await send(initial.snapshot);
        await closed;
      } finally {
        clearInterval(heartbeat);
        unsubscribe();
      }
    });
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
