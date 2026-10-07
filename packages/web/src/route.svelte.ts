import { parseRoute, type Route } from './router';

/** Reactive current route, driven by `hashchange`. */
export function createRouteStore(target: Window = window): { readonly current: Route } {
  let current = $state<Route>(parseRoute(target.location.hash));
  target.addEventListener('hashchange', () => {
    current = parseRoute(target.location.hash);
  });
  return {
    get current() {
      return current;
    },
  };
}
