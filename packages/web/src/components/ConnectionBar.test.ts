// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../core/connection-store';
import ConnectionBar from './ConnectionBar.svelte';

const props = {
  persisted: true,
  wakeLock: 'active' as const,
  keepAwake: false,
  onretry: () => undefined,
  onreauth: () => undefined,
};

const state = (status: ConnectionState['status'], pending = 0): ConnectionState =>
  ({ status, pending, reason: null, retryAt: null, lastError: null }) as ConnectionState;

describe('ConnectionBar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps showing the online label while a sync is brief', async () => {
    const view = render(ConnectionBar, { ...props, connection: state('syncing', 1) });
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByRole('status').textContent).toBe('En línea');

    await view.rerender({ ...props, connection: state('online') });
    await vi.advanceTimersByTimeAsync(2000);
    expect(screen.getByRole('status').textContent).toBe('En línea');
  });

  it('shows the syncing label once a sync lasts long enough to notice', async () => {
    render(ConnectionBar, { ...props, connection: state('syncing', 1) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(screen.getByRole('status').textContent).toBe('Sincronizando…');
  });

  it('shows the other states immediately', () => {
    render(ConnectionBar, { ...props, connection: state('offline') });
    expect(screen.getByRole('status').textContent).toBe('Sin conexión');
  });
});
