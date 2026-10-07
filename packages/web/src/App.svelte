<script lang="ts">
  import { t } from './i18n/t';
  import { createRouteStore } from './route.svelte';
  import { hrefTo } from './router';
  import JudgePlaceholder from './routes/JudgePlaceholder.svelte';

  const router = createRouteStore();
  const route = $derived(router.current);
</script>

<header class="shell">
  <a class="brand" href={hrefTo({ name: 'home' })}>{t('app.title')}</a>
  <span class="tagline">{t('app.tagline')}</span>
</header>

<main class="shell">
  {#if route.name === 'home'}
    <p>{t('home.intro')}</p>
  {:else if route.name === 'judge'}
    <JudgePlaceholder pisteId={route.pisteId} />
  {:else}
    <h1>{t('notFound.title')}</h1>
    <p>{t('notFound.body')}</p>
    <a href={hrefTo({ name: 'home' })}>{t('nav.back')}</a>
  {/if}
</main>

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
