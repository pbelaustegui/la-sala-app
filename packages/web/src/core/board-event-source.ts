import type { BoardMessage, BoardStreamHandlers, BoardStreamPort } from './spectator-store';

/** The slice of the DOM `EventSource` this adapter needs. */
export interface EventSourceLike {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  close(): void;
}

export const BOARD_STREAM_URL = '/pistes/stream';

/** Real `BoardStreamPort`: one `EventSource` on the public board feed. */
export class EventSourceBoardStream implements BoardStreamPort {
  private source: EventSourceLike | null = null;

  constructor(private readonly create: (url: string) => EventSourceLike = (url) => new EventSource(url) as unknown as EventSourceLike) {}

  open(handlers: BoardStreamHandlers): void {
    this.close();
    const source = this.create(BOARD_STREAM_URL);
    source.onopen = () => handlers.onOpen();
    source.onerror = () => handlers.onError();
    source.addEventListener('pistes', (event) => {
      const data = parse(event.data);
      if (data && Array.isArray(data.pisteIds)) handlers.onMessage({ kind: 'pistes', pisteIds: data.pisteIds.map(String) });
    });
    source.addEventListener('snapshot', (event) => {
      const data = parse(event.data);
      if (data && typeof data.pisteId === 'string' && typeof data.snapshot === 'object' && data.snapshot !== null) {
        handlers.onMessage({ kind: 'snapshot', pisteId: data.pisteId, snapshot: data.snapshot } as BoardMessage);
      }
    });
    this.source = source;
  }

  close(): void {
    this.source?.close();
    this.source = null;
  }
}

function parse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
