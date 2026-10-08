// @vitest-environment jsdom
import { createBout, createRules, replay, type BoutEvent, type BoutState } from '@la-sala/domain';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App.svelte';
import type { Snapshot } from '../core/api-client';
import { FakeBoardStream } from '../testing/fake-board-stream';
import { FakeTimers } from '../testing/fake-timers';
import { createMemoryEnv } from '../testing/memory-env';

const T0 = 1_000_000;

function bout(events: BoutEvent[]): BoutState {
  const result = replay(createBout(createRules('foil')), events);
  if (!result.ok) throw new Error('bad fixture');
  return result.state;
}

const snapshot = (serverTime: number, state: BoutState | null, left = 'Ana', right = 'Bea'): Snapshot => ({
  serverTime,
  bout: state,
  fencers: state ? { left, right } : null,
});

function harness() {
  let now = T0;
  let visible = true;
  const visibilityListeners = new Set<() => void>();
  const onlineListeners = new Set<() => void>();
  const offlineListeners = new Set<() => void>();
  const pageShowListeners = new Set<() => void>();
  const subscribe = (set: Set<() => void>) => (callback: () => void) => {
    set.add(callback);
    return () => void set.delete(callback);
  };
  const stream = new FakeBoardStream();
  const timers = new FakeTimers();
  const env = createMemoryEnv({
    boardStream: stream,
    now: () => now,
    timers,
    onOnline: subscribe(onlineListeners),
    onOffline: subscribe(offlineListeners),
    onPageShow: subscribe(pageShowListeners),
    visibility: {
      isVisible: () => visible,
      onChange: (callback) => {
        visibilityListeners.add(callback);
        return () => void visibilityListeners.delete(callback);
      },
    },
  });
  return {
    env,
    stream,
    timers,
    /** Moves the phone clock and lets the UI tick once (the watchdog is left alone). */
    elapse: async (ms: number) => {
      now += ms;
      timers.fireWithDelay(250);
      await tick();
    },
    online: () => onlineListeners.forEach((callback) => callback()),
    offline: () => offlineListeners.forEach((callback) => callback()),
    pageShow: () => pageShowListeners.forEach((callback) => callback()),
    listeners: () => onlineListeners.size + offlineListeners.size + pageShowListeners.size + visibilityListeners.size,
    advanceClock: (ms: number) => void (now += ms),
    setVisible: (value: boolean) => {
      visible = value;
      visibilityListeners.forEach((callback) => callback());
    },
    /** Opens the stream with the given pistes; piste 1 has a clock running since T0. */
    live: async (...pisteIds: string[]) => {
      stream.connect();
      stream.emit({ kind: 'pistes', pisteIds });
      await tick();
    },
    snapshotOf: async (pisteId: string, snap: Snapshot) => {
      stream.emit({ kind: 'snapshot', pisteId, snapshot: snap });
      await tick();
    },
  };
}

const running = bout([{ type: 'clock-started', at: T0 }]);

afterEach(() => {
  window.location.hash = '';
});

describe('public board', () => {
  it('shows a loading state until the stream answers and opens ONE stream', async () => {
    const h = harness();
    render(App, { env: h.env });
    expect(screen.getByText('Conectando…')).toBeTruthy();
    expect(h.stream.opens).toBe(1);
  });

  it('shows the empty state when no pistes exist', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live();
    expect(screen.getByText('Todavía no hay pistas')).toBeTruthy();
    expect(screen.queryByText('Conectando…')).toBeNull();
  });

  it('shows a card per piste with fencers, score, clock, period and phase', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1', '2');
    await h.snapshotOf('1', snapshot(T0, running));
    await h.snapshotOf('2', snapshot(T0, null));

    const card = screen.getByRole('link', { name: /Pista 1/ });
    expect(card.getAttribute('href')).toBe('#/piste/1');
    expect(within(card).getByText('Ana')).toBeTruthy();
    expect(within(card).getByText('Bea')).toBeTruthy();
    expect(within(card).getByText('3:00')).toBeTruthy();
    expect(within(card).getByText('Período 1 de 3')).toBeTruthy();
    expect(within(card).getByText('En juego')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: /Pista 2/ })).getByText('Sin combate')).toBeTruthy();
  });

  it('tags each fencer with the side the judge sees: left first, right second', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));

    const card = screen.getByRole('link', { name: /Pista 1/ });
    expect(within(card).getByText('Ana').closest('.fencer')?.classList.contains('left')).toBe(true);
    expect(within(card).getByText('Bea').closest('.fencer')?.classList.contains('right')).toBe(true);
  });

  it('updates a card when a new snapshot arrives', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));
    const scored = bout([{ type: 'clock-started', at: T0 }, { type: 'touch-scored', side: 'left', at: T0 + 1_000 }]);
    await h.snapshotOf('1', snapshot(T0 + 1_000, scored));

    const card = screen.getByRole('link', { name: /Pista 1/ });
    expect(within(card).getByLabelText('Puntos de Ana').textContent).toBe('1');
    expect(within(card).getByText('Detenido')).toBeTruthy();
  });

  it('ticks the running clock from timestamps without any message', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));
    expect(screen.getByText('3:00')).toBeTruthy();

    await h.elapse(10_000);
    expect(screen.getByText('2:50')).toBeTruthy();
    expect([...h.timers.scheduled.values()].some((timer) => timer.ms === 250)).toBe(true);
  });

  it('stops ticking while the page is hidden and catches up when it is visible again', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));

    h.setVisible(false);
    await h.elapse(10_000);
    expect(screen.getByText('3:00')).toBeTruthy();
    expect([...h.timers.scheduled.values()].some((timer) => timer.ms === 250)).toBe(false);

    h.setVisible(true);
    await tick();
    expect(screen.getByText('2:50')).toBeTruthy();
    await h.elapse(1_000);
    expect(screen.getByText('2:49')).toBeTruthy();
  });

  it('shows card counts per side', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    const carded = bout([
      { type: 'clock-started', at: T0 },
      { type: 'card-given', side: 'left', card: 'yellow', at: T0 },
      { type: 'card-given', side: 'right', card: 'red', at: T0 },
    ]);
    await h.snapshotOf('1', snapshot(T0, carded));
    const card = screen.getByRole('link', { name: /Pista 1/ });
    expect(within(card).getByText('Amarilla ×1')).toBeTruthy();
    expect(within(card).getByText('Roja ×1')).toBeTruthy();
    expect(within(card).queryByText(/Negra/)).toBeNull();
  });

  it('highlights the winner with the reason in words', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    const finished = bout([{ type: 'clock-started', at: T0 }, { type: 'card-given', side: 'right', card: 'black', at: T0 }]);
    await h.snapshotOf('1', snapshot(T0, finished));
    const card = screen.getByRole('link', { name: /Pista 1/ });
    expect(within(card).getByText('Finalizado')).toBeTruthy();
    expect(within(card).getByText('Ganador: Ana por exclusión (tarjeta negra)')).toBeTruthy();
    expect(card.querySelector('.winner')).not.toBeNull();
  });

  it('warns when the connection drops and marks cards as stale with a frozen clock', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));
    expect(screen.queryByText('Sin conexión, mostrando el último estado')).toBeNull();

    await h.elapse(5_000);
    h.stream.fail();
    await tick();
    expect(screen.getByText('Sin conexión, mostrando el último estado')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Pista 1/ }).getAttribute('data-stale')).toBe('true');

    const frozen = screen.getByLabelText('Reloj').textContent;
    await h.elapse(20_000);
    expect(screen.getByLabelText('Reloj').textContent).toBe(frozen);
  });

  it('treats a silent connection as dead: banner, then reconnects', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, running));
    h.timers.fireWithDelay(45_000);
    await tick();
    expect(screen.getByText('Sin conexión, mostrando el último estado')).toBeTruthy();
    expect(h.stream.closes).toBe(1);
  });

  it('removes the banner when the stream reconnects', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    h.stream.fail();
    await tick();
    h.timers.fireAll();
    expect(h.stream.opens).toBe(2);
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0 + 20_000, running));
    expect(screen.queryByText('Sin conexión, mostrando el último estado')).toBeNull();
  });

  it('reconnects at once when the phone comes back online', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    h.stream.fail();
    await tick();
    h.online();
    expect(h.stream.opens).toBe(2);
  });

  it('marks the board stale as soon as the phone goes offline', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    h.offline();
    expect(await screen.findByText('Sin conexión, mostrando el último estado')).toBeTruthy();
  });

  it('reconnects when the tab is visible again only if the feed is stale or silent', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    h.setVisible(false);
    h.setVisible(true);
    expect(h.stream.opens).toBe(1); // healthy: nothing to do
    h.advanceClock(46_000);
    h.setVisible(false);
    h.setVisible(true);
    expect(h.stream.opens).toBe(2); // silent for longer than the watchdog window
    h.stream.fail();
    h.pageShow();
    expect(h.stream.opens).toBe(3); // restored from the back/forward cache while stale
  });

  it('stops listening to the browser when the spectator leaves', async () => {
    const h = harness();
    const view = render(App, { env: h.env });
    await h.live('1');
    expect(h.listeners()).toBeGreaterThan(0);
    view.unmount();
    expect(h.listeners()).toBe(0);
  });

  it('has a discreet link to the judge entry', async () => {
    const h = harness();
    render(App, { env: h.env });
    expect(screen.getByRole('link', { name: 'Soy juez' }).getAttribute('href')).toBe('#/judge');
  });

  it('closes the stream when the spectator leaves for the judge screens', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1');
    window.location.hash = '#/judge';
    await waitFor(() => expect(h.stream.isOpen).toBe(false));
    expect(h.timers.scheduled.size).toBe(0); // no tick, no retry, no watchdog left behind
  });
});

describe('piste detail', () => {
  it('opens from a card and shows the same data with a way back', async () => {
    const h = harness();
    render(App, { env: h.env });
    await h.live('1', '2');
    await h.snapshotOf('1', snapshot(T0, running));
    await h.snapshotOf('2', snapshot(T0, null));

    await fireEvent.click(screen.getByRole('link', { name: /Pista 1/ }));
    expect(await screen.findByRole('heading', { name: 'Pista 1' })).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.getByText('3:00')).toBeTruthy();
    expect(screen.getByText('Período 1 de 3')).toBeTruthy();
    expect(h.stream.opens).toBe(1);

    await fireEvent.click(screen.getByRole('link', { name: 'Volver al tablero' }));
    expect(await screen.findByRole('link', { name: /Pista 2/ })).toBeTruthy();
    expect(h.stream.opens).toBe(1);
  });

  it('lists every card given, with its side', async () => {
    const h = harness();
    window.location.hash = '#/piste/1';
    render(App, { env: h.env });
    await h.live('1');
    await h.snapshotOf('1', snapshot(T0, bout([{ type: 'clock-started', at: T0 }, { type: 'card-given', side: 'left', card: 'yellow', at: T0 }])));
    expect(screen.getByText('Amarilla ×1')).toBeTruthy();
  });

  it('says so when the piste does not exist', async () => {
    const h = harness();
    window.location.hash = '#/piste/9';
    render(App, { env: h.env });
    expect(screen.getByText('Conectando…')).toBeTruthy();
    await h.live('1');
    expect(screen.getByText('Esa pista no existe')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver al tablero' })).toBeTruthy();
  });
});
