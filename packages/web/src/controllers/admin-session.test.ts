import { describe, expect, it } from 'vitest';
import type { AdminPiste, ApiClient, ApiError, ApiResult } from '../core/api-client';
import { AdminPinStore } from '../core/admin-pin-store';
import { MemoryStorage } from '../core/storage';
import { AdminSessionController } from './admin-session';

const PISTES: readonly AdminPiste[] = [{ id: 'p1', pin: '1111' }];
const NEW_PISTES: readonly AdminPiste[] = [
  { id: 'p1', pin: '2222' },
  { id: 'p2', pin: '3333' },
];

function harness(opts: { pin?: string } = {}) {
  const store = new AdminPinStore(new MemoryStorage());
  if (opts.pin) store.set(opts.pin);
  const calls: string[] = [];
  const state = { error: null as ApiError | null, correctPin: '9999' };
  const respond = (pin: string, value: readonly AdminPiste[]): ApiResult<readonly AdminPiste[]> => {
    if (state.error) return { ok: false, error: state.error };
    if (pin !== state.correctPin) return { ok: false, error: { kind: 'unauthorized' } };
    return { ok: true, value };
  };
  const api: Pick<ApiClient, 'listAdminPistes' | 'createAdminPistes'> = {
    listAdminPistes: async (pin) => (calls.push('list'), respond(pin, PISTES)),
    createAdminPistes: async (pin, count) => (calls.push(`create:${count}`), respond(pin, NEW_PISTES)),
  };
  return { admin: new AdminSessionController(api, store), store, calls, state };
}

describe('AdminSessionController', () => {
  it('asks for the PIN when none is remembered', async () => {
    const { admin, calls } = harness();
    await admin.start();
    expect(admin.get()).toMatchObject({ step: 'pin', error: null });
    expect(calls).toEqual([]);
  });

  it('loads the pistes with a remembered PIN', async () => {
    const { admin } = harness({ pin: '9999' });
    await admin.start();
    expect(admin.get()).toMatchObject({ step: 'ready', pistes: PISTES });
  });

  it('remembers a correct PIN and lists the pistes', async () => {
    const { admin, store } = harness();
    await admin.submitPin(' 9999 ');
    expect(admin.get()).toMatchObject({ step: 'ready', pistes: PISTES });
    expect(store.get()).toBe('9999');
  });

  it('keeps a wrong PIN out of the store and stays on PIN entry', async () => {
    const { admin, store } = harness();
    await admin.submitPin('0000');
    expect(admin.get()).toMatchObject({ step: 'pin', error: 'wrong-pin' });
    expect(store.get()).toBeNull();
  });

  it('ignores an empty PIN', async () => {
    const { admin, calls } = harness();
    await admin.submitPin('  ');
    expect(calls).toEqual([]);
    expect(admin.get().step).toBe('pin');
  });

  it('offers a retry when the list cannot be loaded, keeping the PIN', async () => {
    const { admin, state, store } = harness();
    state.error = { kind: 'network' };
    await admin.submitPin('9999');
    expect(admin.get().step).toBe('offline');
    expect(store.get()).toBe('9999');
    state.error = null;
    await admin.start();
    expect(admin.get().step).toBe('ready');
  });

  it('requires an explicit confirmation before replacing the pistes', async () => {
    const { admin, calls } = harness({ pin: '9999' });
    await admin.start();
    admin.requestCreate(2);
    expect(admin.get().confirming).toBe(2);
    expect(calls).toEqual(['list']);
    await admin.confirmCreate();
    expect(calls).toEqual(['list', 'create:2']);
    expect(admin.get()).toMatchObject({ step: 'ready', pistes: NEW_PISTES, confirming: null });
  });

  it('cancels a pending creation without calling the server', async () => {
    const { admin, calls } = harness({ pin: '9999' });
    await admin.start();
    admin.requestCreate(2);
    admin.cancelCreate();
    await admin.confirmCreate();
    expect(admin.get()).toMatchObject({ confirming: null, pistes: PISTES });
    expect(calls).toEqual(['list']);
  });

  it.each([0, 101, 1.5, Number.NaN])('rejects the count %s before asking for confirmation', async (count) => {
    const { admin } = harness({ pin: '9999' });
    await admin.start();
    admin.requestCreate(count);
    expect(admin.get()).toMatchObject({ confirming: null, error: 'invalid-count' });
  });

  it('forgets the PIN and returns to PIN entry on 401 while creating', async () => {
    const { admin, store, state } = harness({ pin: '9999' });
    await admin.start();
    state.correctPin = 'changed';
    admin.requestCreate(2);
    await admin.confirmCreate();
    expect(admin.get()).toMatchObject({ step: 'pin', error: 'wrong-pin', confirming: null });
    expect(store.get()).toBeNull();
  });

  it('reports a failed creation and keeps the current list', async () => {
    const { admin, state } = harness({ pin: '9999' });
    await admin.start();
    state.error = { kind: 'network' };
    admin.requestCreate(2);
    await admin.confirmCreate();
    expect(admin.get()).toMatchObject({ step: 'ready', pistes: PISTES, error: 'failed', confirming: null });
  });

  it('forgets the PIN on lock', async () => {
    const { admin, store } = harness({ pin: '9999' });
    await admin.start();
    admin.lock();
    expect(store.get()).toBeNull();
    expect(admin.get()).toMatchObject({ step: 'pin', pistes: [] });
  });
});
