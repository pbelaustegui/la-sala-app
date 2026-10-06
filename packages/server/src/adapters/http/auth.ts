import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { AttemptLimiter, PisteRepository } from '../../application/ports';

/**
 * Constant-time string comparison. Inputs of different length are rejected up front:
 * `timingSafeEqual` throws on them, and PIN length is not a secret worth protecting.
 */
export function safeEqual(candidate: string | undefined, expected: string): boolean {
  if (candidate === undefined) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const ADMIN_HEADER = 'x-admin-pin';
export const PISTE_HEADER = 'x-piste-pin';

export function unauthorized() {
  return Response.json({ error: 'unauthorized' }, { status: 401 });
}

export const ADMIN_KEY = 'admin';

/** 429 with `Retry-After` in whole seconds. Sent even for a correct PIN so a lockout leaks nothing. */
function lockedOut(retryAfterMs: number) {
  const seconds = Math.ceil(retryAfterMs / 1000);
  return Response.json({ error: 'too-many-attempts' }, { status: 429, headers: { 'retry-after': String(seconds) } });
}

/** Locks out first, then compares the PIN in constant time and records the outcome. */
function checkPin(limiter: AttemptLimiter, key: string, candidate: string | undefined, expected: string) {
  const retryAfterMs = limiter.retryAfterMs(key);
  if (retryAfterMs > 0) return lockedOut(retryAfterMs);
  if (!safeEqual(candidate, expected)) {
    limiter.recordFailure(key);
    return unauthorized();
  }
  limiter.recordSuccess(key);
  return null;
}

/** Requires the `x-admin-pin` header to match the configured admin PIN. */
export function requireAdmin(adminPin: string, limiter: AttemptLimiter): MiddlewareHandler {
  return async (c, next) => {
    const rejection = checkPin(limiter, ADMIN_KEY, c.req.header(ADMIN_HEADER), adminPin);
    if (rejection) return rejection;
    await next();
  };
}

/**
 * Requires `x-piste-pin` to match the PIN of the piste in `:id`.
 * Unknown piste ids answer 404 (ids are public); a wrong PIN answers 401 and, repeated,
 * locks that piste's judge PIN out with 429.
 */
export function requirePistePin(repository: PisteRepository, limiter: AttemptLimiter): MiddlewareHandler {
  return async (c, next) => {
    const id = c.req.param('id') ?? '';
    const piste = await repository.findPiste(id);
    if (!piste) return Response.json({ error: 'unknown-piste' }, { status: 404 });
    const rejection = checkPin(limiter, `piste:${id}`, c.req.header(PISTE_HEADER), piste.pin);
    if (rejection) return rejection;
    await next();
  };
}
