import { describe, expect, it } from 'vitest';
import { ApiClient } from '../core/api-client';
import { CurrentBoutPointer } from '../core/current-bout';
import { LocalBout } from '../core/local-bout';
import { PinStore } from '../core/pin-store';
import { EMPTY_SETUP_FORM } from '../core/setup-form';
import { MemoryStorage, boutKey } from '../core/storage';
import { FakeServer } from '../core/testing/fake-server';
import { EntryFlow, type EntryState } from './entry-flow';

const PIN = '4821';

function harness() {
  const server = new FakeServer({ pisteId: 'p1', pin: PIN, serverNow: () => 1_000_000 });
  const storage = new MemoryStorage();
  const pinStorage = new MemoryStorage();
  const pins = new PinStore(pinStorage);
  let counter = 0;
  const flow = new EntryFlow({
    pisteId: 'p1',
    api: new ApiClient({ fetch: server.fetch, now: () => 1_000_000 }),
    pins,
    storage,
    pointer: new CurrentBoutPointer(storage),
    newId: () => `id-${++counter}`,
  });
  const step = () => flow.get().step;
  const state = <S extends EntryState['step']>(expected: S) => {
    const current = flow.get();
    if (current.step !== expected) throw new Error(`expected step ${expected}, got ${current.step}`);
    return current as Extract<EntryState, { step: S }>;
  };
  return { server, storage, pins, flow, step, state };
}

const FORM = { ...EMPTY_SETUP_FORM, left: 'Ana', right: 'Bea' };

describe('EntryFlow: PIN', () => {
  it('asks for the PIN when none is remembered', async () => {
    const h = harness();
    await h.flow.start();
    expect(h.state('pin').error).toBeNull();
    expect(h.server.requests).toHaveLength(0);
  });

  it('rejects a malformed PIN without calling the server', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin('12');
    expect(h.state('pin').error).toEqual({ kind: 'invalid-format' });
    expect(h.server.requests).toHaveLength(0);
  });

  it('reports a wrong PIN and does not remember it', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin('0000');
    expect(h.state('pin').error).toEqual({ kind: 'wrong-pin' });
    expect(h.pins.get('p1')).toBeNull();
  });

  it('reports a lockout with the seconds to wait', async () => {
    const h = harness();
    await h.flow.start();
    h.server.forceStatus = { status: 429, headers: { 'retry-after': '30' } };
    await h.flow.submitPin(PIN);
    expect(h.state('pin').error).toEqual({ kind: 'locked', retryAfterMs: 30_000 });
    expect(h.pins.get('p1')).toBeNull();
  });

  it('reports a network failure so the judge can retry', async () => {
    const h = harness();
    await h.flow.start();
    h.server.down = true;
    await h.flow.submitPin(PIN);
    expect(h.state('pin').error).toEqual({ kind: 'offline' });
  });

  it('goes to setup and remembers the PIN when the piste has no bout', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    expect(h.step()).toBe('setup');
    expect(h.pins.get('p1')).toBe(PIN);
  });

  it('verifies the PIN with an empty batch, never sending it in the body or the URL', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    const [request] = h.server.requests;
    expect(request?.path).toBe('/pistes/p1/events');
    expect(request?.body).toEqual({ events: [] });
    expect(request?.headers['x-piste-pin']).toBe(PIN);
  });

  it('skips the keypad when the PIN is remembered', async () => {
    const h = harness();
    h.pins.set('p1', PIN);
    await h.flow.start();
    expect(h.step()).toBe('setup');
  });

  it('forgets a remembered PIN the server no longer accepts', async () => {
    const h = harness();
    h.pins.set('p1', '9999');
    await h.flow.start();
    expect(h.state('pin').error).toEqual({ kind: 'wrong-pin' });
    expect(h.pins.get('p1')).toBeNull();
  });
});

describe('EntryFlow: starting and resuming', () => {
  it('starts a bout, stores it locally and becomes ready', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    await h.flow.startBout({ ...FORM, weapon: 'epee', periods: 2, touchLimit: '10' });

    const ready = h.state('ready');
    expect(ready.bout.setup).toEqual({ weapon: 'epee', options: { periods: 2, touchLimit: 10 }, left: 'Ana', right: 'Bea' });
    expect(ready.pin).toBe(PIN);
    expect(h.server.setup).toMatchObject({ weapon: 'epee', left: 'Ana', right: 'Bea' });
    expect(h.storage.get(boutKey({ pisteId: 'p1', boutId: ready.boutId }))).not.toBeNull();
  });

  it('shows validation errors without calling the server', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    const before = h.server.requests.length;
    await h.flow.startBout({ ...FORM, left: '' });
    expect(h.state('setup').errors).toEqual({ left: 'setup.error.nameRequired' });
    expect(h.server.requests).toHaveLength(before);
  });

  it('keeps the form and reports offline when the bout cannot be started', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    h.server.down = true;
    await h.flow.startBout(FORM);
    expect(h.state('setup').failure).toEqual({ kind: 'offline' });
  });

  async function withLiveBout() {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    await h.flow.startBout(FORM);
    const first = h.state('ready');
    return { ...h, first, flow: h.flow };
  }

  it('offers resume or new when the piste already has a bout', async () => {
    const h = harness();
    h.server.setup = { weapon: 'foil', left: 'Ana', right: 'Bea' };
    await h.flow.start();
    await h.flow.submitPin(PIN);
    expect(h.state('choose')).toMatchObject({ left: 'Ana', right: 'Bea' });
  });

  it('resume builds the local bout from the server snapshot when this device has none', async () => {
    const h = harness();
    h.server.setup = { weapon: 'epee', options: { periods: 2, touchLimit: 7 }, left: 'Cris', right: 'Dani' };
    await h.flow.start();
    await h.flow.submitPin(PIN);
    h.flow.resume();

    const { bout } = h.state('ready');
    expect(bout.setup).toEqual({
      weapon: 'epee',
      options: { periods: 2, touchLimit: 7, periodDurationMs: 180_000, breakDurationMs: 60_000 },
      left: 'Cris',
      right: 'Dani',
    });
    expect(bout.state(1_000_000).rules.touchLimit).toBe(7);
    expect(bout.pending()).toHaveLength(0);
  });

  it('resume keeps this device\'s own unsynced log', async () => {
    const { first, server, storage, pins } = await withLiveBout();
    const stored = LocalBout.load(storage, { pisteId: 'p1', boutId: first.boutId });
    expect(stored).not.toBeNull();
    stored?.append({ id: 'e1', event: { type: 'clock-started', at: 1_000_001 } });

    const flow = new EntryFlow({
      pisteId: 'p1',
      api: new ApiClient({ fetch: server.fetch, now: () => 1_000_000 }),
      pins,
      storage,
      pointer: new CurrentBoutPointer(storage),
      newId: () => 'other',
    });
    await flow.start();
    expect(flow.get().step).toBe('choose');
    flow.resume();
    const ready = flow.get();
    expect(ready.step === 'ready' && ready.bout.pending().map((e) => e.id)).toEqual(['e1']);
  });

  it('resume prefers the server state over a local log that has nothing unsynced', async () => {
    const { first, server, storage, pins } = await withLiveBout();
    // Another device started a different bout on this piste in the meantime.
    server.setup = { weapon: 'sabre', left: 'Eva', right: 'Fer' };
    const flow = new EntryFlow({
      pisteId: 'p1',
      api: new ApiClient({ fetch: server.fetch, now: () => 1_000_000 }),
      pins,
      storage,
      pointer: new CurrentBoutPointer(storage),
      newId: () => 'fresh',
    });
    await flow.start();
    flow.resume();
    const ready = flow.get();
    expect(ready.step === 'ready' && ready.bout.setup.left).toBe('Eva');
    expect(storage.get(boutKey({ pisteId: 'p1', boutId: first.boutId }))).toBeNull();
  });

  it('a new bout needs confirmation because it archives the live one', async () => {
    const { flow } = await withLiveBout();
    flow.leave();
    await flow.start();
    expect(flow.get().step).toBe('choose');
    flow.requestNewBout();
    expect(flow.get().step).toBe('confirm-new');
    flow.cancelNewBout();
    expect(flow.get().step).toBe('choose');
    flow.requestNewBout();
    flow.confirmNewBout();
    expect(flow.get().step).toBe('setup');
  });

  it('starting a new bout replaces the stored one', async () => {
    const { flow, first, storage } = await withLiveBout();
    flow.leave();
    await flow.start();
    flow.requestNewBout();
    flow.confirmNewBout();
    await flow.startBout({ ...FORM, left: 'Eva' });
    const next = flow.get();
    expect(next.step === 'ready' && next.boutId).not.toBe(first.boutId);
    expect(storage.get(boutKey({ pisteId: 'p1', boutId: first.boutId }))).toBeNull();
  });
});

describe('EntryFlow: new bout after a finished one', () => {
  it('goes straight to setup and replaces the stored bout', async () => {
    const h = harness();
    await h.flow.start();
    await h.flow.submitPin(PIN);
    await h.flow.startBout(FORM);
    const first = h.state('ready');

    h.flow.startNewBout();
    expect(h.step()).toBe('setup');
    await h.flow.startBout({ ...FORM, left: 'Eva' });
    const next = h.state('ready');
    expect(next.boutId).not.toBe(first.boutId);
    expect(h.storage.get(boutKey({ pisteId: 'p1', boutId: first.boutId }))).toBeNull();
  });
});

describe('EntryFlow: offline', () => {
  it('opens the local bout when the PIN is remembered and the network is down', async () => {
    const { server, storage, pins, flow } = harness();
    await flow.start();
    await flow.submitPin(PIN);
    await flow.startBout(FORM);
    flow.leave();

    server.down = true;
    await flow.start();
    const ready = flow.get();
    expect(ready.step).toBe('ready');
    expect(ready.step === 'ready' && ready.offline).toBe(true);
    expect(pins.get('p1')).toBe(PIN);
    expect(storage).toBeDefined();
  });

  it('says the piste cannot be opened offline when there is nothing local', async () => {
    const h = harness();
    h.pins.set('p1', PIN);
    h.server.down = true;
    await h.flow.start();
    expect(h.step()).toBe('offline');
  });
});
