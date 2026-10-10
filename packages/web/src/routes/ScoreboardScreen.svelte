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
  let facing = $state(services.facing.get());
  function setFacing(value: boolean): void {
    facing = value;
    services.facing.set(value);
  }
  const wakeLock = session.wakeLock;
  // svelte-ignore state_referenced_locally
  const names = {
    left: bout.setup.left || t('board.side.left'),
    right: bout.setup.right || t('board.side.right'),
  };

  onDestroy(() => session.dispose());

  const retry = () => void session.queue.retryNow();
</script>

<h1 class="piste">{t('board.piste', { piste: pisteId })}</h1>

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
  oncorrect={(patch) => controller.setState(patch)}
  {onnewbout}
  {facing}
  onfacing={setFacing}
/>

<div class="actions leave">
  <a class="btn" href={hrefTo({ name: 'judge-list' })}>{t('board.leave')}</a>
  <a class="btn" href={hrefTo({ name: 'board' })}>{t('nav.board')}</a>
</div>

<style>
  .piste {
    font-size: 1.1rem;
    margin: 0.25rem 0;
  }
  .leave {
    margin-top: 1.5rem;
  }
</style>
