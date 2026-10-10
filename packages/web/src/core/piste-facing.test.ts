import { describe, expect, it } from 'vitest';
import { ApiClient } from './api-client';
import { PisteFacing } from './piste-facing';
import { FakeServer } from './testing/fake-server';

const PIN = '1234';

function make() {
  const server = new FakeServer({ pisteId: 'p1', pin: PIN, serverNow: () => 10_000 });
  const api = new ApiClient({ fetch: server.fetch, now: () => 10_000 });
  const facing = new PisteFacing({ api, pisteId: 'p1', pin: PIN });
  return { server, api, facing };
}

describe('PisteFacing', () => {
  it('starts off, idle and without a failure', () => {
    expect(make().facing.get()).toEqual({ facing: false, busy: false, failed: false });
  });

  it('adopts the piste flag stored on the server', async () => {
    const { server, facing } = make();
    server.facingAudience = true;
    await facing.load();
    expect(facing.get().facing).toBe(true);
  });

  it('keeps the last known value when the server cannot be reached while loading', async () => {
    const { server, facing } = make();
    server.down = true;
    await facing.load();
    expect(facing.get()).toEqual({ facing: false, busy: false, failed: false });
  });

  it('shows the new value at once, locks while sending and ends with the server answer', async () => {
    const { server, facing } = make();
    const done = facing.set(true);
    expect(facing.get()).toMatchObject({ facing: true, busy: true });
    await done;
    expect(facing.get()).toEqual({ facing: true, busy: false, failed: false });
    expect(server.facingAudience).toBe(true);
    expect(server.requests.at(-1)).toMatchObject({ method: 'PUT', headers: { 'x-piste-pin': PIN }, body: { facing: true } });
  });

  it('ignores a second change while one is being sent', async () => {
    const { server, facing } = make();
    const first = facing.set(true);
    await facing.set(false);
    await first;
    expect(facing.get().facing).toBe(true);
    expect(server.requests.filter((r) => r.method === 'PUT')).toHaveLength(1);
  });

  it('goes back to the last known value and flags the failure when the change cannot be saved', async () => {
    const { server, facing } = make();
    server.down = true;
    await facing.set(true);
    expect(facing.get()).toEqual({ facing: false, busy: false, failed: true });
    expect(server.facingAudience).toBe(false);
  });

  it('clears the failure on the next successful change', async () => {
    const { server, facing } = make();
    server.down = true;
    await facing.set(true);
    server.down = false;
    await facing.set(true);
    expect(facing.get()).toEqual({ facing: true, busy: false, failed: false });
  });

  it('reverts on a rejected PIN too', async () => {
    const { server, facing } = make();
    server.forceStatus = { status: 401 };
    await facing.set(true);
    expect(facing.get()).toEqual({ facing: false, busy: false, failed: true });
  });
});
