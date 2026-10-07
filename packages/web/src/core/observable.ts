type Subscriber<T> = (value: T) => void;

/**
 * Minimal observable satisfying Svelte's store contract (`subscribe` calls back immediately
 * and returns an unsubscribe), so controllers stay free of Svelte and components can use `$flow`.
 */
export class Observable<T> {
  private readonly subscribers = new Set<Subscriber<T>>();

  constructor(private value: T) {}

  get(): T {
    return this.value;
  }

  set(next: T): void {
    this.value = next;
    for (const subscriber of [...this.subscribers]) subscriber(next);
  }

  subscribe(run: Subscriber<T>): () => void {
    this.subscribers.add(run);
    run(this.value);
    return () => void this.subscribers.delete(run);
  }
}
