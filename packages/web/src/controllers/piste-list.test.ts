import { describe, expect, it } from 'vitest';
import { ApiClient } from '../core/api-client';
import { FakeServer } from '../core/testing/fake-server';
import { PisteListController } from './piste-list';

function harness() {
  const server = new FakeServer({ pisteId: 'p1', pin: '1234', serverNow: () => 1 });
  const list = new PisteListController(new ApiClient({ fetch: server.fetch, now: () => 1 }));
  return { server, list };
}

describe('PisteListController', () => {
  it('starts loading and shows the pistes with their status', async () => {
    const { list } = harness();
    expect(list.get().status).toBe('loading');
    await list.refresh();
    expect(list.get()).toEqual({ status: 'ready', pistes: [{ id: 'p1', status: 'idle' }] });
  });

  it('reports offline when the pistes cannot be loaded', async () => {
    const { list, server } = harness();
    server.down = true;
    await list.refresh();
    expect(list.get().status).toBe('offline');
  });

  it('keeps the last known pistes visible when a refresh fails', async () => {
    const { list, server } = harness();
    await list.refresh();
    server.down = true;
    await list.refresh();
    expect(list.get()).toEqual({ status: 'offline', pistes: [{ id: 'p1', status: 'idle' }] });
  });

  it('recovers when the network returns', async () => {
    const { list, server } = harness();
    server.down = true;
    await list.refresh();
    server.down = false;
    await list.refresh();
    expect(list.get().status).toBe('ready');
  });
});
