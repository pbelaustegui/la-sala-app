import { describe, expect, it } from 'vitest';
import { FakeTimers } from '../testing/fake-timers';
import { createIdleReveal, IDLE_MS } from './idle-reveal';

function setup() {
  const timers = new FakeTimers();
  const changes: boolean[] = [];
  const reveal = createIdleReveal({ timers, onChange: (visible) => changes.push(visible) });
  return { timers, changes, reveal };
}

describe('idle reveal', () => {
  it('uses a 5 second timeout and schedules it on creation (starts visible)', () => {
    const { timers, changes } = setup();
    expect(IDLE_MS).toBe(5_000);
    expect([...timers.scheduled.values()].map((t) => t.ms)).toEqual([5_000]);
    expect(changes).toEqual([]);
  });

  it('hides when the idle timer fires', () => {
    const { timers, changes } = setup();
    timers.fireAll();
    expect(changes).toEqual([false]);
  });

  it('an interaction restarts the countdown instead of hiding', () => {
    const { timers, changes, reveal } = setup();
    reveal.interact();
    expect(timers.scheduled.size).toBe(1);
    expect(changes).toEqual([]);
    timers.fireAll();
    expect(changes).toEqual([false]);
  });

  it('an interaction while hidden shows again and schedules the next hide', () => {
    const { timers, changes, reveal } = setup();
    timers.fireAll();
    reveal.interact();
    expect(changes).toEqual([false, true]);
    expect(timers.scheduled.size).toBe(1);
    timers.fireAll();
    expect(changes).toEqual([false, true, false]);
  });

  it('never hides while held, and counts down again once released', () => {
    const { timers, changes, reveal } = setup();
    reveal.hold(true);
    expect(timers.scheduled.size).toBe(0);
    reveal.interact();
    expect(timers.scheduled.size).toBe(0);
    reveal.hold(false);
    expect(timers.scheduled.size).toBe(1);
    timers.fireAll();
    expect(changes).toEqual([false]);
  });

  it('holding while hidden reveals', () => {
    const { timers, changes, reveal } = setup();
    timers.fireAll();
    reveal.hold(true);
    expect(changes).toEqual([false, true]);
  });

  it('dispose cancels the pending timer and ignores later calls', () => {
    const { timers, changes, reveal } = setup();
    reveal.dispose();
    expect(timers.scheduled.size).toBe(0);
    reveal.interact();
    reveal.hold(false);
    expect(timers.scheduled.size).toBe(0);
    expect(changes).toEqual([]);
  });
});
