import type { BoardMessage, BoardStreamHandlers, BoardStreamPort } from '../core/spectator-store';

/** In-memory `BoardStreamPort`: tests drive the connection by hand. */
export class FakeBoardStream implements BoardStreamPort {
  opens = 0;
  closes = 0;
  private handlers: BoardStreamHandlers | null = null;

  get isOpen(): boolean {
    return this.handlers !== null;
  }

  open(handlers: BoardStreamHandlers): void {
    this.opens++;
    this.handlers = handlers;
  }

  close(): void {
    this.closes++;
    this.handlers = null;
  }

  connect(): void {
    this.handlers?.onOpen();
  }

  emit(message: BoardMessage): void {
    this.handlers?.onMessage(message);
  }

  fail(): void {
    this.handlers?.onError();
  }
}
