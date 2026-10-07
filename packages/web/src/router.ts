export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'judge'; readonly pisteId: string }
  | { readonly name: 'not-found' };

const NOT_FOUND: Route = { name: 'not-found' };

function decode(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/** Parses `location.hash` (`#/`, `#/judge/:pisteId`). Never throws. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return { name: 'home' };

  const [head, pisteId, ...rest] = segments;
  if (head === 'judge' && pisteId !== undefined && rest.length === 0) {
    const decoded = decode(pisteId);
    return decoded === null ? NOT_FOUND : { name: 'judge', pisteId: decoded };
  }
  return NOT_FOUND;
}

/** Inverse of `parseRoute`. */
export function hrefTo(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'judge':
      return `#/judge/${encodeURIComponent(route.pisteId)}`;
    case 'not-found':
      return '#/';
  }
}
