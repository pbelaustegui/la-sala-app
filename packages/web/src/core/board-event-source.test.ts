import { describe, expect, it, vi } from 'vitest';
import { EventSourceBoardStream, type EventSourceLike } from './board-event-source';

class FakeEventSource implements EventSourceLike {
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  private readonly listeners = new Map<string, (event: { data: string }) => void>();
  constructor(readonly url: string) {}
  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    this.listeners.set(type, listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(type: string, data: string): void {
    this.listeners.get(type)?.({ data });
  }
}

function setup() {
  let source!: FakeEventSource;
  const port = new EventSourceBoardStream((url) => (source = new FakeEventSource(url)));
  const handlers = { onOpen: vi.fn(), onMessage: vi.fn(), onError: vi.fn() };
  port.open(handlers);
  return { port, handlers, source };
}

describe('EventSourceBoardStream', () => {
  it('connects to the board feed and reports open and error', () => {
    const { handlers, source } = setup();
    expect(source.url).toBe('/pistes/stream');
    source.onopen!();
    source.onerror!();
    expect(handlers.onOpen).toHaveBeenCalledOnce();
    expect(handlers.onError).toHaveBeenCalledOnce();
  });

  it('parses piste-set and snapshot messages and ignores malformed ones', () => {
    const { handlers, source } = setup();
    source.emit('pistes', JSON.stringify({ pisteIds: ['1', '2'] }));
    const snapshot = { serverTime: 5, bout: null, fencers: null };
    source.emit('snapshot', JSON.stringify({ pisteId: '1', snapshot }));
    source.emit('snapshot', '{not json');
    source.emit('snapshot', JSON.stringify({ nope: true }));
    expect(handlers.onMessage.mock.calls).toEqual([
      [{ kind: 'pistes', pisteIds: ['1', '2'] }],
      [{ kind: 'snapshot', pisteId: '1', snapshot }],
    ]);
  });

  it('closes the underlying source', () => {
    const { port, source } = setup();
    port.close();
    port.close();
    expect(source.closed).toBe(true);
  });
});
