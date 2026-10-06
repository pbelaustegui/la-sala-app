import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { PisteRepository } from '../../application/ports';

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

/** Requires the `x-admin-pin` header to match the configured admin PIN. */
export function requireAdmin(adminPin: string): MiddlewareHandler {
  return async (c, next) => {
    if (!safeEqual(c.req.header(ADMIN_HEADER), adminPin)) return unauthorized();
    await next();
  };
}

/**
 * Requires `x-piste-pin` to match the PIN of the piste in `:id`.
 * Unknown piste ids answer 404 (ids are public); a wrong PIN answers 401.
 */
export function requirePistePin(repository: PisteRepository): MiddlewareHandler {
  return async (c, next) => {
    const piste = await repository.findPiste(c.req.param('id') ?? '');
    if (!piste) return Response.json({ error: 'unknown-piste' }, { status: 404 });
    if (!safeEqual(c.req.header(PISTE_HEADER), piste.pin)) return unauthorized();
    await next();
  };
}
