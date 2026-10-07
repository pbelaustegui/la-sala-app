import { serveStatic } from '@hono/node-server/serve-static';
import type { Hono } from 'hono';

/** Path prefixes owned by the API. They are never answered with the app shell. */
const API_PREFIXES = ['/pistes', '/admin', '/health'] as const;

const HASHED_ASSETS_PREFIX = '/assets/';
export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const REVALIDATE_CACHE = 'no-cache';

function isApiPath(path: string): boolean {
  return API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** An app route such as `/judge/p1`. A path with an extension is a file, so a miss is a real 404. */
function isAppRoute(path: string): boolean {
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  return !lastSegment.includes('.');
}

/**
 * Hashed bundles (`/assets/*`, content-addressed by the build) can be cached forever.
 * Everything else (index.html, the service worker, the manifest, icons) must be revalidated:
 * a stale index.html or service worker would pin phones to an old version of the app.
 */
function cacheControlFor(requestPath: string): string {
  return requestPath.startsWith(HASHED_ASSETS_PREFIX) ? IMMUTABLE_CACHE : REVALIDATE_CACHE;
}

/**
 * Serves the built PWA (`packages/web/dist`) from the same origin as the API.
 *
 * Mount it AFTER the API routes: those answer first and anything they do not handle falls
 * through here. API prefixes are skipped explicitly so an unknown API path keeps answering
 * 404 instead of the app shell, and only GET/HEAD are served (the serving middleware itself
 * does not check the method).
 */
export function mountStaticWeb(app: Hono, root: string): void {
  const files = serveStatic({ root });
  const appShell = serveStatic({ root, path: 'index.html' });
  // serveStatic hands back the Response it built (or calls `next` when there is no such file).
  const noFile = async () => undefined;

  app.on(['GET', 'HEAD'], '*', async (c, next) => {
    if (isApiPath(c.req.path)) return next();
    let response = await files(c, noFile);
    if (!response && isAppRoute(c.req.path)) response = await appShell(c, noFile);
    if (!response) return next();
    // Set on the finished response: headers set on the context after it was built are lost.
    response.headers.set('Cache-Control', cacheControlFor(c.req.path));
    return response;
  });
}
