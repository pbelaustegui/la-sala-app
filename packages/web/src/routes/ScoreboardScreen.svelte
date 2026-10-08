<script lang="ts">
  import { onDestroy } from 'svelte';
  import ConnectionBar from '../components/ConnectionBar.svelte';
  import Scoreboard from '../components/Scoreboard.svelte';
  import { createJudgeSession } from '../controllers/judge-session';
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
  const wakeLock = session.wakeLock;
  // svelte-ignore state_referenced_locally
  const names = {
    left: bout.setup.left || t('board.side.left'),
    right: bout.setup.right || t('board.side.right'),
  };

  onDestroy(() => session.dispose());

  const retry = () => void session.queue.retryNow();
</script>

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
  ondouble={() => controller.doubleTouch()}
  onclock={() => controller.toggleClock()}
  onundo={() => controller.undo()}
  oncard={(side, card) => controller.giveCard(side, card)}
  onskipbreak={() => controller.skipBreak()}
  onpriority={(side) => controller.drawPriority(side)}
  {onnewbout}
/>

<p class="leave">
  <a href={hrefTo({ name: 'judge-list' })}>{t('board.leave')}</a>
  <a href={hrefTo({ name: 'board' })}>{t('nav.board')}</a>
</p>

<style>
  .leave {
    text-align: center;
    margin-top: 1.5rem;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem 1.5rem;
  }
</style>
