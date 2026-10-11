<script lang="ts">
  import { onDestroy } from 'svelte';
  import ConnectionBar from '../components/ConnectionBar.svelte';
  import Scoreboard from '../components/Scoreboard.svelte';
  import { createJudgeSession } from '../controllers/judge-session';
  import { PisteFacing } from '../core/piste-facing';
  import type { LocalBout } from '../core/local-bout';
  import { getServices } from '../env';
  import { t } from '../i18n/t';
  import { hrefTo } from '../router';

  let {
    pisteId,
    pin,
    bout,
    startedOffline = false,
    onreauth,
    onnewbout,
  }: {
    pisteId: string;
    pin: string;
    bout: LocalBout;
    startedOffline?: boolean;
    /** The server rejected the PIN: go back to the keypad. */
    onreauth: () => void;
    /** The judge finished a bout and wants another one. */
    onnewbout: () => void;
  } = $props();

  const services = getServices();
  // The route re-creates this screen per bout, so these props are fixed for its lifetime.
  // svelte-ignore state_referenced_locally
  const session = createJudgeSession({ services, pisteId, pin, bout, startedOffline });
  const controller = session.controller;
  const connection = session.queue.connection;
  // svelte-ignore state_referenced_locally
  const facing = new PisteFacing({ api: services.api, pisteId, pin });
  void facing.load();
  const wakeLock = session.wakeLock;
  // svelte-ignore state_referenced_locally
  const names = {
    left: bout.setup.left || t('board.side.left'),
    right: bout.setup.right || t('board.side.right'),
  };

  onDestroy(() => session.dispose());

  const retry = () => void session.queue.retryNow();
</script>

<!-- Fills the viewport: the judge never scrolls during a bout. -->
<div class="screen">
  <div class="head">
    <h1 class="piste">{t('board.piste', { piste: pisteId })}</h1>
    <a class="btn icon-link" href={hrefTo({ name: 'board' })} aria-label={t('nav.board')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </a>
    <a class="btn icon-link" href={hrefTo({ name: 'judge-list' })} aria-label={t('board.leave')}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </a>
  </div>

  <ConnectionBar
    connection={$connection}
    persisted={$controller.persisted}
    wakeLock={$wakeLock}
    keepAwake={$controller.active}
    onretry={retry}
    {onreauth}
  />

  <Scoreboard
    model={$controller}
    {names}
    pending={$connection.pending}
    ontouch={(side) => controller.touch(side)}
    onsubtract={(side) => controller.subtractPoint(side)}
    ondouble={() => controller.doubleTouch()}
    onclock={() => controller.toggleClock()}
    onpreset={(minutes) => controller.setClockPreset(minutes)}
    onreset={() => controller.resetBout()}
    onundo={() => controller.undo()}
    ontogglecard={(side, card) => controller.toggleCard(side, card)}
    onskipbreak={() => controller.skipBreak()}
    onpriority={(side) => controller.drawPriority(side)}
    oncorrect={(patch) => controller.setState(patch)}
    {onnewbout}
    facing={$facing.facing}
    facingBusy={$facing.busy}
    facingFailed={$facing.failed}
    onfacing={(value) => void facing.set(value)}
  />
</div>

<style>
  /* Covers the app shell: the board owns the whole screen, so the page itself cannot scroll. */
  .screen {
    position: fixed;
    inset: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    box-sizing: border-box;
    padding: max(0.4rem, env(safe-area-inset-top)) max(0.6rem, env(safe-area-inset-right))
      max(0.4rem, env(safe-area-inset-bottom)) max(0.6rem, env(safe-area-inset-left));
    background: var(--bg);
    overflow: hidden;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .piste {
    flex: 1;
    margin: 0;
    font-size: 1rem;
  }
  .icon-link {
    padding: 0;
  }
  .icon-link svg {
    width: 22px;
    height: 22px;
  }
</style>
