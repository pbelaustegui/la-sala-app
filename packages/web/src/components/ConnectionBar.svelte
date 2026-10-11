<script lang="ts">
  import type { ConnectionState } from '../core/connection-store';
  import type { WakeLockStatus } from '../core/wake-lock';
  import { t } from '../i18n/t';

  let {
    connection,
    persisted,
    wakeLock,
    keepAwake,
    onretry,
    onreauth,
  }: {
    connection: ConnectionState;
    persisted: boolean;
    wakeLock: WakeLockStatus;
    /** A bout is running, so a missing wake lock deserves a warning. */
    keepAwake: boolean;
    onretry: () => void;
    onreauth: () => void;
  } = $props();

  // Every scored point starts a sync that usually ends within milliseconds. Showing "Syncing…" for it
  // would just flash, so the label only appears once a sync lasts long enough to be noticed.
  const SYNC_LABEL_DELAY_MS = 600;
  let syncIsSlow = $state(false);

  $effect(() => {
    if (connection.status !== 'syncing') {
      syncIsSlow = false;
      return;
    }
    const timer = setTimeout(() => (syncIsSlow = true), SYNC_LABEL_DELAY_MS);
    return () => clearTimeout(timer);
  });

  // Same idea for the pending count: right after a point it is 1 for a moment. While offline or stuck
  // the count matters, so it shows at once there.
  let pendingIsLasting = $state(false);

  $effect(() => {
    if (connection.pending === 0) {
      pendingIsLasting = false;
      return;
    }
    if (connection.status === 'offline' || connection.status === 'needs-attention') {
      pendingIsLasting = true;
      return;
    }
    const timer = setTimeout(() => (pendingIsLasting = true), SYNC_LABEL_DELAY_MS);
    return () => clearTimeout(timer);
  });

  const shownStatus = $derived(connection.status === 'syncing' && !syncIsSlow ? 'online' : connection.status);

  const statusKey = $derived(
    (
      {
        online: 'conn.online',
        offline: 'conn.offline',
        syncing: 'conn.syncing',
        'needs-attention': 'conn.attention',
      } as const
    )[shownStatus],
  );

  function secondsToWait(state: ConnectionState): number {
    if (state.reason?.kind !== 'rate-limited') return 0;
    return Math.max(1, Math.ceil(state.reason.retryAfterMs / 1000));
  }
</script>

<div class="bar" data-status={shownStatus}>
  <span class="dot" aria-hidden="true"></span>
  <span class="status" role="status">{t(statusKey)}</span>
  {#if connection.status === 'offline'}
    <!-- Offline is expected on a piste and scoring keeps working, so no notice: just a small retry. -->
    <button class="retry" type="button" aria-label={t('conn.retry')} title={t('conn.retry')} onclick={onretry}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    </button>
  {/if}
  <span class="pending">
    {connection.pending > 0 && pendingIsLasting ?t('conn.pending', { count: connection.pending }) : t('conn.synced')}
  </span>
</div>

{#if connection.status === 'needs-attention' && connection.reason}
  <div class="notice" role="alert">
    {#if connection.reason.kind === 'rate-limited'}
      <p>{t('conn.attention.rate-limited', { seconds: secondsToWait(connection) })}</p>
      <div class="actions">
        <button class="btn" type="button" onclick={onretry}>{t('conn.retry')}</button>
      </div>
    {:else if connection.reason.kind === 'unauthorized'}
      <p>{t('conn.attention.unauthorized')}</p>
      <div class="actions">
        <button class="btn primary" type="button" onclick={onreauth}>{t('conn.attention.unauthorized.action')}</button>
      </div>
    {:else if connection.reason.kind === 'resynced'}
      <p>{t('conn.attention.resynced', { count: connection.reason.discarded })}</p>
      <div class="actions">
        <button class="btn primary" type="button" onclick={onretry}>{t('conn.attention.resynced.action')}</button>
      </div>
    {:else}
      <p>{t(`conn.attention.${connection.reason.kind}`)}</p>
      <div class="actions">
        <button class="btn" type="button" onclick={onretry}>{t('conn.retry')}</button>
      </div>
    {/if}
  </div>
{/if}

{#if !persisted}
  <p class="notice" role="alert">{t('board.notSaved')}</p>
{/if}

{#if keepAwake && (wakeLock === 'denied' || wakeLock === 'unsupported')}
  <p class="notice">{t('board.wake.unavailable')}</p>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2rem;
    font-size: 0.95rem;
  }
  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: #5dd68a;
  }
  [data-status='offline'] .dot {
    background: #ff9a3d;
  }
  [data-status='syncing'] .dot {
    background: var(--accent);
  }
  [data-status='needs-attention'] .dot {
    background: #ff5d5d;
  }
  .retry {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    min-width: 2rem;
    padding: 0;
    color: var(--fg);
    background: transparent;
    border: 1px solid var(--muted);
    border-radius: 0.5rem;
    cursor: pointer;
  }
  .pending {
    margin-left: auto;
    color: var(--muted);
  }
  .notice {
    margin: 0.25rem 0;
  }
  .notice p {
    margin: 0;
  }
</style>
