import { describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../application/ports';
import { InProcessHub } from './in-process-hub';

const snap = (serverTime: number): Snapshot => ({ serverTime, bout: null, fencers: null });

describe('InProcessHub', () => {
  it('delivers snapshots only to subscribers of that piste', () => {
    const hub = new InProcessHub();
    const one = vi.fn();
    const two = vi.fn();
    hub.subscribe('1', one);
    hub.subscribe('2', two);
    hub.publish('1', snap(10));
    expect(one).toHaveBeenCalledWith(snap(10));
    expect(two).not.toHaveBeenCalled();
  });

  it('stops delivering after unsubscribe and cleans up', () => {
    const hub = new InProcessHub();
    const listener = vi.fn();
    const unsubscribe = hub.subscribe('1', listener);
    expect(hub.subscriberCount('1')).toBe(1);
    unsubscribe();
    unsubscribe();
    hub.publish('1', snap(1));
    expect(listener).not.toHaveBeenCalled();
    expect(hub.subscriberCount('1')).toBe(0);
  });

  it('keeps delivering to others when a listener throws', () => {
    const hub = new InProcessHub();
    const good = vi.fn();
    hub.subscribe('1', () => {
      throw new Error('broken subscriber');
    });
    hub.subscribe('1', good);
    expect(() => hub.publish('1', snap(1))).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
  });

  it('tolerates a listener unsubscribing during publish', () => {
    const hub = new InProcessHub();
    const second = vi.fn();
    const unsubscribe = hub.subscribe('1', () => unsubscribe());
    hub.subscribe('1', second);
    hub.publish('1', snap(1));
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('InProcessHub all-pistes subscription', () => {
  it('delivers every piste snapshot with its id, and keeps per-piste delivery intact', () => {
    const hub = new InProcessHub();
    const all = vi.fn();
    const one = vi.fn();
    hub.subscribeAll(all);
    hub.subscribe('1', one);
    hub.publish('1', snap(1));
    hub.publish('2', snap(2));
    expect(all.mock.calls).toEqual([
      [{ kind: 'snapshot', pisteId: '1', snapshot: snap(1) }],
      [{ kind: 'snapshot', pisteId: '2', snapshot: snap(2) }],
    ]);
    expect(one).toHaveBeenCalledOnce();
  });

  it('announces the current piste set', () => {
    const hub = new InProcessHub();
    const all = vi.fn();
    hub.subscribeAll(all);
    hub.publishPistes(['1', '2']);
    expect(all).toHaveBeenCalledWith({ kind: 'pistes', pisteIds: ['1', '2'] });
  });

  it('unsubscribes idempotently and survives a throwing listener', () => {
    const hub = new InProcessHub();
    const good = vi.fn();
    hub.subscribeAll(() => {
      throw new Error('broken');
    });
    const unsubscribe = hub.subscribeAll(good);
    expect(() => hub.publish('1', snap(1))).not.toThrow();
    expect(hub.boardSubscriberCount()).toBe(2);
    unsubscribe();
    unsubscribe();
    hub.publish('1', snap(2));
    expect(good).toHaveBeenCalledOnce();
    expect(hub.boardSubscriberCount()).toBe(1);
  });
});
