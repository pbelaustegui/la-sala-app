import { createBout, createRules, replay, settle, type BoutEvent } from '@la-sala/domain';

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

interface StoredEvent {
  readonly id: string;
  readonly event: BoutEvent;
}

interface FakeSetup {
  readonly weapon: 'foil' | 'epee' | 'sabre';
  readonly options?: Parameters<typeof createRules>[1];
  readonly left: string;
  readonly right: string;
}

/**
 * In-memory stand-in for the Hono server used by core tests. It speaks the same wire
 * contract (status codes, headers, snapshot shape) and runs the real domain `replay`, so
 * sync tests exercise ordering, idempotency and domain rejection without sockets.
 */
export class FakeServer {
  /** While true every request rejects like a dead network. */
  down = false;
  /** Number of upcoming event submissions that are applied but whose response is lost. */
  loseResponses = 0;
  /** When set, the next response is replaced by this status (and optional headers). */
  forceStatus: { status: number; headers?: Record<string, string>; body?: unknown } | null = null;
  readonly requests: RecordedRequest[] = [];
  readonly events: StoredEvent[] = [];
  setup: FakeSetup | null = null;

  constructor(
    private readonly options: { pisteId: string; pin: string; serverNow: () => number },
  ) {}

  readonly fetch = async (input: string, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(input, 'http://fake');
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]),
    );
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    this.requests.push({ method, path: url.pathname, headers, body });

    if (this.down) throw new TypeError('Failed to fetch');
    if (this.forceStatus) {
      const { status, headers: extra, body: payload } = this.forceStatus;
      this.forceStatus = null;
      return Response.json(payload ?? { error: 'forced' }, { status, headers: extra });
    }

    const { pisteId, pin } = this.options;
    const base = `/pistes/${pisteId}`;
    if (method === 'GET' && url.pathname === '/pistes') {
      return Response.json([{ id: pisteId, status: this.snapshot().bout?.phase.kind ?? 'idle' }]);
    }
    if (method === 'GET' && url.pathname === `${base}/state`) return Response.json(this.snapshot());

    if (method === 'POST' && url.pathname.startsWith(base)) {
      if (headers['x-piste-pin'] !== pin) return Response.json({ error: 'unauthorized' }, { status: 401 });
      if (url.pathname === `${base}/bout`) {
        this.setup = body as FakeSetup;
        this.events.length = 0;
        return Response.json(this.snapshot(), { status: 201 });
      }
      if (url.pathname === `${base}/events`) return this.submit(body as { events: ({ id: string } & BoutEvent)[] });
    }
    return Response.json({ error: 'unknown-piste' }, { status: 404 });
  };

  snapshot() {
    const serverTime = this.options.serverNow();
    if (!this.setup) return { serverTime, bout: null, fencers: null };
    const result = replay(
      createBout(createRules(this.setup.weapon, this.setup.options)),
      this.events.map((stored) => stored.event),
    );
    if (!result.ok) throw new Error('fake server holds an invalid log');
    return {
      serverTime,
      bout: settle(result.state, serverTime),
      fencers: { left: this.setup.left, right: this.setup.right },
    };
  }

  private submit(body: { events: ({ id: string } & BoutEvent)[] }): Response {
    if (!this.setup) return Response.json({ error: 'no-bout' }, { status: 409 });
    const known = new Set(this.events.map((stored) => stored.id));
    const fresh: { stored: StoredEvent; batchIndex: number }[] = [];
    body.events.forEach(({ id, ...event }, batchIndex) => {
      if (known.has(id)) return;
      known.add(id);
      fresh.push({ stored: { id, event: event as BoutEvent }, batchIndex });
    });
    const next = [...this.events, ...fresh.map((f) => f.stored)];
    const result = replay(
      createBout(createRules(this.setup.weapon, this.setup.options)),
      next.map((stored) => stored.event),
    );
    if (!result.ok) {
      const failing = fresh[result.error.index - this.events.length];
      return Response.json({ index: failing?.batchIndex ?? 0, error: result.error.error }, { status: 422 });
    }
    this.events.push(...fresh.map((f) => f.stored));
    if (this.loseResponses > 0) {
      this.loseResponses -= 1;
      throw new TypeError('Failed to fetch');
    }
    return Response.json(this.snapshot());
  }
}
