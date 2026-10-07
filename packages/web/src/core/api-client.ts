import type { BoutState, DomainError } from '@la-sala/domain';
import type { ClockOffset } from './clock-offset';
import type { ClientEvent } from './event-factory';
import type { BoutSetup } from './local-bout';

/** What the server returns after state-changing calls and for `GET /pistes/:id/state`. */
export interface Snapshot {
  readonly serverTime: number;
  readonly bout: BoutState | null;
  readonly fencers: { readonly left: string; readonly right: string } | null;
}

export interface PisteStatus {
  readonly id: string;
  /** `idle` when no bout was started, otherwise the phase kind. */
  readonly status: string;
}

export type ApiError =
  | { readonly kind: 'unauthorized' }
  | { readonly kind: 'unknown-piste' }
  /** 409: the piste has no current bout. */
  | { readonly kind: 'no-bout' }
  | { readonly kind: 'invalid-request' }
  /** 422: the domain rejected the batch; nothing was stored. `index` is the position in the batch. */
  | { readonly kind: 'rejected'; readonly index: number; readonly error: DomainError }
  | { readonly kind: 'rate-limited'; readonly retryAfterMs: number }
  /** The request never completed (offline, DNS, timeout, aborted). */
  | { readonly kind: 'network' }
  /** 5xx or a response we cannot understand. */
  | { readonly kind: 'server'; readonly status: number };

export type ApiResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };

/** The subset of `fetch` the client needs; injected so tests never touch the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientDeps {
  readonly fetch: FetchLike;
  /** Client clock in epoch ms, used to measure round trips for the clock offset. */
  readonly now: () => number;
  /** Receives one observation per response that carries `serverTime`. */
  readonly clockOffset?: ClockOffset;
  /** Prefix for every path; empty means same origin (the PWA is served by the API). */
  readonly baseUrl?: string;
}

export const PIN_HEADER = 'x-piste-pin';
/** Used when a 429 carries no usable Retry-After. */
export const DEFAULT_RETRY_AFTER_MS = 60_000;

const fail = (error: ApiError): ApiResult<never> => ({ ok: false, error });

function retryAfterMs(response: Response): number {
  const seconds = Number(response.headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_RETRY_AFTER_MS;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Typed access to the judge-facing endpoints. Every method resolves; none throws. */
export class ApiClient {
  constructor(private readonly deps: ApiClientDeps) {}

  listPistes(): Promise<ApiResult<readonly PisteStatus[]>> {
    return this.request<readonly PisteStatus[]>('GET', '/pistes');
  }

  getSnapshot(pisteId: string): Promise<ApiResult<Snapshot>> {
    return this.request<Snapshot>('GET', `/pistes/${encodeURIComponent(pisteId)}/state`);
  }

  startBout(pisteId: string, pin: string, setup: BoutSetup): Promise<ApiResult<Snapshot>> {
    return this.request<Snapshot>('POST', `/pistes/${encodeURIComponent(pisteId)}/bout`, setup, pin);
  }

  /** Posts a batch in order. Ids make it idempotent: the server skips ids it already stored. */
  submitEvents(pisteId: string, pin: string, events: readonly ClientEvent[]): Promise<ApiResult<Snapshot>> {
    const body = { events: events.map(({ id, event }) => ({ id, ...event })) };
    return this.request<Snapshot>('POST', `/pistes/${encodeURIComponent(pisteId)}/events`, body, pin);
  }

  private async request<T>(method: string, path: string, body?: unknown, pin?: string): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (pin !== undefined) headers[PIN_HEADER] = pin;

    const requestStart = this.deps.now();
    let response: Response;
    try {
      response = await this.deps.fetch(`${this.deps.baseUrl ?? ''}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      return fail({ kind: 'network' });
    }
    const requestEnd = this.deps.now();

    const payload = await readJson(response);
    if (response.ok) {
      if (payload === undefined) return fail({ kind: 'server', status: response.status });
      this.observe(payload, requestStart, requestEnd);
      return { ok: true, value: payload as T };
    }
    return fail(this.mapFailure(response, payload));
  }

  private observe(payload: unknown, requestStart: number, requestEnd: number): void {
    const serverTime = (payload as { serverTime?: unknown } | null)?.serverTime;
    if (typeof serverTime === 'number') {
      this.deps.clockOffset?.observe({ requestStart, requestEnd, serverTime });
    }
  }

  private mapFailure(response: Response, payload: unknown): ApiError {
    switch (response.status) {
      case 400:
        return { kind: 'invalid-request' };
      case 401:
        return { kind: 'unauthorized' };
      case 404:
        return { kind: 'unknown-piste' };
      case 409:
        return { kind: 'no-bout' };
      case 422: {
        const { index, error } = (payload ?? {}) as { index?: number; error?: DomainError };
        if (typeof index === 'number' && error) return { kind: 'rejected', index, error };
        return { kind: 'server', status: 422 };
      }
      case 429:
        return { kind: 'rate-limited', retryAfterMs: retryAfterMs(response) };
      default:
        return { kind: 'server', status: response.status };
    }
  }
}
