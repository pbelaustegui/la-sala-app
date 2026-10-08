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

  const statusKey = $derived(
    (
      {
        online: 'conn.online',
        offline: 'conn.offline',
        syncing: 'conn.syncing',
        'needs-attention': 'conn.attention',
      } as const
    )[connection.status],
  );

  function secondsToWait(state: ConnectionState): number {
    if (state.reason?.kind !== 'rate-limited') return 0;
    return Math.max(1, Math.ceil(state.reason.retryAfterMs / 1000));
  }
</script>

<div class="bar" data-status={connection.status}>
  <span class="dot" aria-hidden="true"></span>
  <span class="status" role="status">{t(statusKey)}</span>
  <span class="pending">
    {connection.pending > 0 ? t('conn.pending', { count: connection.pending }) : t('conn.synced')}
  </span>
</div>

{#if connection.status === 'offline'}
  <div class="notice">
    <p>{t('conn.offlineHelp')}</p>
    <div class="actions">
      <button class="btn" type="button" onclick={onretry}>{t('conn.retry')}</button>
    </div>
  </div>
{/if}

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
