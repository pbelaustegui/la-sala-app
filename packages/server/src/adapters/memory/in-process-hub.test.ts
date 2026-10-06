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
