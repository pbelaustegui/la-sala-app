export type Route =
  /** Public live board: every piste at a glance. */
  | { readonly name: 'board' }
  /** Public detail of one piste, with large numerals. */
  | { readonly name: 'piste'; readonly pisteId: string }
  /** Judge entry: the list of pistes to officiate. */
  | { readonly name: 'judge-list' }
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

/** Parses `location.hash` (`#/`, `#/piste/:id`, `#/judge`, `#/judge/:pisteId`). Never throws. */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '');
  const segments = path.split('/').filter((segment) => segment !== '');
  if (segments.length === 0) return { name: 'board' };

  const [head, pisteId, ...rest] = segments;
  if (head === 'judge' && pisteId === undefined) return { name: 'judge-list' };
  if ((head === 'judge' || head === 'piste') && pisteId !== undefined && rest.length === 0) {
    const decoded = decode(pisteId);
    if (decoded === null) return NOT_FOUND;
    return head === 'judge' ? { name: 'judge', pisteId: decoded } : { name: 'piste', pisteId: decoded };
  }
  return NOT_FOUND;
}

/** Inverse of `parseRoute`. */
export function hrefTo(route: Route): string {
  switch (route.name) {
    case 'board':
      return '#/';
    case 'piste':
      return `#/piste/${encodeURIComponent(route.pisteId)}`;
    case 'judge-list':
      return '#/judge';
    case 'judge':
      return `#/judge/${encodeURIComponent(route.pisteId)}`;
    case 'not-found':
      return '#/';
  }
}
