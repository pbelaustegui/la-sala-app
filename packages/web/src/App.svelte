<script lang="ts">
  import { setContext } from 'svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { UpdateNotice } from './core/update-notice';
  import { createBrowserEnv, createServices, ENV_KEY, SERVICES_KEY, type AppEnv } from './env';
  import { t } from './i18n/t';
  import { createRouteStore } from './route.svelte';
  import { hrefTo } from './router';
  import JudgeScreen from './routes/JudgeScreen.svelte';
  import PisteListScreen from './routes/PisteListScreen.svelte';
  import SpectatorScreen from './routes/SpectatorScreen.svelte';

  // The environment is fixed for the lifetime of the app, so reading the prop once is intended.
  // svelte-ignore state_referenced_locally
  let { env = createBrowserEnv() }: { env?: AppEnv } = $props();
  // svelte-ignore state_referenced_locally
  setContext(ENV_KEY, env);
  // svelte-ignore state_referenced_locally
  setContext(SERVICES_KEY, createServices(env));

  // svelte-ignore state_referenced_locally
  const updates = new UpdateNotice(env.updates);

  const router = createRouteStore();
  const route = $derived(router.current);
</script>

<UpdateBanner notice={updates} />

{#if route.name === 'board' || route.name === 'piste'}
  <!-- One instance for both spectator screens: moving between them keeps the single connection. -->
  <SpectatorScreen pisteId={route.name === 'piste' ? route.pisteId : null} />
{:else}
  <header class="shell">
    <a class="brand" href={hrefTo({ name: 'judge-list' })}>{t('app.title')}</a>
    <span class="tagline">{t('app.tagline')}</span>
  </header>

  <main class="shell">
    {#if route.name === 'judge-list'}
      <PisteListScreen />
    {:else if route.name === 'judge'}
      {#key route.pisteId}
        <JudgeScreen pisteId={route.pisteId} />
      {/key}
    {:else}
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.body')}</p>
      <a href={hrefTo({ name: 'board' })}>{t('nav.back')}</a>
    {/if}
  </main>
{/if}

<style>
  .shell {
    padding: 0.75rem 1rem;
    max-width: 40rem;
    margin: 0 auto;
  }
  .brand {
    font-weight: 700;
    font-size: 1.25rem;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }
  .tagline {
    color: var(--muted);
    margin-left: 0.5rem;
  }
</style>
