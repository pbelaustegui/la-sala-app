<script lang="ts">
  import { onMount } from 'svelte';
  import PisteCard from '../components/PisteCard.svelte';
  import PisteDetail from '../components/PisteDetail.svelte';
  import { createIdleReveal } from '../core/idle-reveal';
  import { toPisteView } from '../core/piste-view';
  import { SpectatorStore } from '../core/spectator-store';
  import { getEnv } from '../env';
  import { t } from '../i18n/t';
  import { hrefTo } from '../router';

  let { pisteId = null, showAdminLink = false }: { pisteId?: string | null; showAdminLink?: boolean } = $props();

  /** UI-only redraw rate: a running clock is derived from timestamps, no message is needed. */
  const TICK_MS = 250;

  const env = getEnv();
  const store = new SpectatorStore({
    port: env.boardStream,
    now: env.now,
    setTimeout: (fn, ms) => env.timers.setTimeout(fn, ms),
    clearTimeout: (handle) => env.timers.clearTimeout(handle),
    random: env.random,
  });

  let now = $state(env.now());
  let tickHandle: unknown = null;
  let idle = $state(false);

  const views = $derived($store.pistes.map((entry) => toPisteView(entry, now)));
  const detail = $derived(pisteId === null ? null : (views.find((view) => view.pisteId === pisteId) ?? null));

  function schedule(): void {
    tickHandle = env.timers.setTimeout(() => {
      now = env.now();
      schedule();
    }, TICK_MS);
  }

  function startTicking(): void {
    if (tickHandle !== null) return;
    now = env.now();
    schedule();
  }

  function stopTicking(): void {
    if (tickHandle !== null) env.timers.clearTimeout(tickHandle);
    tickHandle = null;
  }

  onMount(() => {
    store.start();
    if (env.visibility.isVisible()) startTicking();
    const unwatch = env.visibility.onChange(() => {
      if (env.visibility.isVisible()) {
        startTicking();
        store.retryNow(); // no-op while the feed is healthy
      } else stopTicking();
    });
    // After airplane mode the old connection is dead even if it still looks live: force it.
    const unwatchOnline = env.onOnline(() => store.retryNow(true));
    const unwatchOffline = env.onOffline(() => store.markOffline());
    const unwatchPageShow = env.onPageShow(() => store.retryNow());
    // Secondary controls fade out when nobody touches the screen; any interaction brings them back.
    const reveal = createIdleReveal({ timers: env.timers, onChange: (visible) => (idle = !visible) });
    const inChrome = (target: EventTarget | null) => target instanceof Element && target.closest('[data-idle-chrome]') !== null;
    const onInteract = () => reveal.interact();
    const onFocusIn = (event: Event) => {
      reveal.interact();
      reveal.hold(inChrome(event.target));
    };
    const onFocusOut = (event: FocusEvent) => reveal.hold(inChrome(event.relatedTarget));
    const interactions = ['pointermove', 'pointerdown', 'touchstart', 'keydown'] as const;
    for (const type of interactions) window.addEventListener(type, onInteract, { passive: true });
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      for (const type of interactions) window.removeEventListener(type, onInteract);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      reveal.dispose();
      unwatch();
      unwatchOnline();
      unwatchOffline();
      unwatchPageShow();
      stopTicking();
      store.stop();
    };
  });
</script>

<div class="spectator" class:idle>
  <header class="bar">
    <a class="brand" href={hrefTo({ name: 'board' })}>{t('app.title')}</a>
    {#if pisteId !== null}
      <a class="back" data-idle-chrome inert={idle} href={hrefTo({ name: 'board' })}>{t('spectator.back')}</a>
    {/if}
  </header>

  {#if $store.connection === 'stale'}
    <p class="banner" role="status">{t('spectator.stale')}</p>
  {/if}

  {#if pisteId === null}
    {#if views.length > 0}
      <ul class="grid">
        {#each views as view (view.pisteId)}
          <li><PisteCard {view} /></li>
        {/each}
      </ul>
    {:else if $store.connection === 'connecting'}
      <p class="message" role="status">{t('spectator.connecting')}</p>
    {:else if $store.connection === 'live'}
      <p class="message">{t('spectator.empty')}</p>
    {/if}
  {:else if detail !== null}
    <PisteDetail view={detail} />
  {:else if $store.connection === 'connecting'}
    <p class="message" role="status">{t('spectator.connecting')}</p>
  {:else if $store.connection === 'live'}
    <p class="message">{t('spectator.missing')}</p>
  {/if}

  <footer class="foot" data-idle-chrome inert={idle}>
    <a class="btn judge" href={hrefTo({ name: 'judge-list' })}>{t('spectator.judgeLink')}</a>
    {#if showAdminLink}
      <a class="btn judge" href={hrefTo({ name: 'admin' })}>{t('nav.admin')}</a>
    {/if}
  </footer>
</div>

<style>
  .spectator {
    min-height: 100vh;
    padding: 0.75rem max(1rem, env(safe-area-inset-right)) 1rem max(1rem, env(safe-area-inset-left));
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  .brand {
    font-weight: 800;
    font-size: 1.5rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .back {
    display: inline-flex;
    align-items: center;
    padding: 0.5rem 1rem;
    font-weight: 700;
    border: 2px solid var(--muted);
    border-radius: 0.75rem;
    text-decoration: none;
  }
  .banner {
    margin: 0;
    padding: 0.75rem 1rem;
    font-weight: 700;
    color: #0b1020;
    background: var(--accent);
    border-radius: 0.75rem;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
    gap: 1rem;
  }
  .message {
    margin: 2rem 0;
    text-align: center;
    font-size: 1.5rem;
    font-weight: 700;
  }
  .foot {
    margin-top: auto;
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.5rem 0.75rem;
  }
  .judge {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .back,
  .foot {
    transition:
      opacity 0.4s ease,
      visibility 0s;
  }
  .idle .back,
  .idle .foot {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity 0.4s ease,
      visibility 0s 0.4s;
  }
  @media (prefers-reduced-motion: reduce) {
    .back,
    .foot,
    .idle .back,
    .idle .foot {
      transition: none;
    }
  }
</style>
