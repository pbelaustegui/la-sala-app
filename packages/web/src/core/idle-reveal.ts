import type { Timers } from './sync-queue';

/** Inactivity before the secondary controls fade out. */
export const IDLE_MS = 5_000;

export interface IdleReveal {
  /** Any user interaction: shows the controls and restarts the countdown. */
  interact(): void;
  /** While held (a control has focus) the controls never hide. Releasing restarts the countdown. */
  hold(held: boolean): void;
  dispose(): void;
}

/**
 * Decides when idle chrome is visible. Starts visible; hides `idleMs` after the last
 * interaction unless held. Framework-free: timing goes through the injected `Timers`.
 */
export function createIdleReveal(options: {
  timers: Timers;
  onChange: (visible: boolean) => void;
  idleMs?: number;
}): IdleReveal {
  const { timers, onChange, idleMs = IDLE_MS } = options;
  let visible = true;
  let held = false;
  let disposed = false;
  let handle: unknown = null;

  const clear = (): void => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
  };
  const show = (): void => {
    if (visible) return;
    visible = true;
    onChange(true);
  };
  const arm = (): void => {
    clear();
    if (held) return;
    handle = timers.setTimeout(() => {
      handle = null;
      if (held || !visible) return;
      visible = false;
      onChange(false);
    }, idleMs);
  };

  arm();

  return {
    interact() {
      if (disposed) return;
      show();
      arm();
    },
    hold(next) {
      if (disposed) return;
      held = next;
      if (held) show();
      arm();
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
