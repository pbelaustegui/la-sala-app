import { describe, expect, it } from 'vitest';
import { WakeLockController, type VisibilitySource, type WakeLockPort } from './wake-lock';

class FakeSentinel {
  released = false;
  private listeners: (() => void)[] = [];
  async release(): Promise<void> {
    this.released = true;
  }
  addEventListener(_type: 'release', listener: () => void): void {
    this.listeners.push(listener);
  }
  /** The system took the lock away (tab hidden, battery saver). */
  revoke(): void {
    this.released = true;
    this.listeners.forEach((listener) => listener());
  }
}

function harness(options: { reject?: boolean; visible?: boolean } = {}) {
  const sentinels: FakeSentinel[] = [];
  let visible = options.visible ?? true;
  let rejectNext = options.reject ?? false;
  const listeners = new Set<() => void>();
  const port: WakeLockPort = {
    request: async () => {
      if (rejectNext) throw new DOMException('not allowed', 'NotAllowedError');
      const sentinel = new FakeSentinel();
      sentinels.push(sentinel);
      return sentinel;
    },
  };
  const visibility: VisibilitySource = {
    isVisible: () => visible,
    onChange: (callback) => {
      listeners.add(callback);
      return () => void listeners.delete(callback);
    },
  };
  return {
    sentinels,
    listeners,
    controller: new WakeLockController(port, visibility),
    setVisible: (value: boolean) => {
      visible = value;
      listeners.forEach((listener) => listener());
    },
    rejectNext: (value: boolean) => void (rejectNext = value),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('WakeLockController', () => {
  it('is unsupported without the API and never throws', async () => {
    const controller = new WakeLockController(null, { isVisible: () => true, onChange: () => () => undefined });
    await controller.setWanted(true);
    expect(controller.get()).toBe('unsupported');
  });

  it('acquires the lock when wanted and releases it when no longer wanted', async () => {
    const h = harness();
    await h.controller.setWanted(true);
    expect(h.controller.get()).toBe('active');
    expect(h.sentinels).toHaveLength(1);

    await h.controller.setWanted(false);
    expect(h.controller.get()).toBe('inactive');
    expect(h.sentinels[0]?.released).toBe(true);
  });

  it('does not request twice while it already holds the lock', async () => {
    const h = harness();
    await h.controller.setWanted(true);
    await h.controller.setWanted(true);
    expect(h.sentinels).toHaveLength(1);
  });

  it('handles a rejected request by reporting denied', async () => {
    const h = harness({ reject: true });
    await h.controller.setWanted(true);
    expect(h.controller.get()).toBe('denied');
  });

  it('re-acquires after the page becomes visible again', async () => {
    const h = harness();
    await h.controller.setWanted(true);
    h.sentinels[0]?.revoke();
    expect(h.controller.get()).toBe('inactive');

    h.setVisible(false);
    await settle();
    expect(h.sentinels).toHaveLength(1);
    h.setVisible(true);
    await settle();
    expect(h.sentinels).toHaveLength(2);
    expect(h.controller.get()).toBe('active');
  });

  it('does not re-acquire when it is no longer wanted', async () => {
    const h = harness();
    await h.controller.setWanted(true);
    await h.controller.setWanted(false);
    h.setVisible(true);
    await settle();
    expect(h.sentinels).toHaveLength(1);
  });

  it('does not request while the page is hidden', async () => {
    const h = harness({ visible: false });
    await h.controller.setWanted(true);
    expect(h.sentinels).toHaveLength(0);
    expect(h.controller.get()).toBe('inactive');
  });

  it('recovers from a denied request on the next visibility change', async () => {
    const h = harness({ reject: true });
    await h.controller.setWanted(true);
    h.rejectNext(false);
    h.setVisible(true);
    await settle();
    expect(h.controller.get()).toBe('active');
  });

  it('dispose releases the lock and stops listening', async () => {
    const h = harness();
    await h.controller.setWanted(true);
    h.controller.dispose();
    await settle();
    expect(h.sentinels[0]?.released).toBe(true);
    expect(h.listeners.size).toBe(0);
  });
});
