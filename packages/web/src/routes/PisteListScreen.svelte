<script lang="ts">
  import { onMount } from 'svelte';
  import { PisteListController } from '../controllers/piste-list';
  import { getServices } from '../env';
  import { es } from '../i18n/es';
  import { t, type CopyKey } from '../i18n/t';
  import { hrefTo } from '../router';
  import Icon from '../components/Icon.svelte';

  const { api } = getServices();
  const list = new PisteListController(api);

  onMount(() => void list.refresh());

  function statusLabel(status: string): string {
    const key = `pistes.status.${status}`;
    return key in es ? t(key as CopyKey) : t('pistes.status.unknown');
  }
</script>

<div class="page">
<h1>{t('pistes.title')}</h1>
<p>{t('home.intro')}</p>

{#if $list.status === 'offline'}
  <p class="notice" role="alert">{t('pistes.offline')}</p>
{/if}

{#if $list.status === 'loading'}
  <p>{t('pistes.loading')}</p>
{:else if $list.pistes.length === 0 && $list.status === 'ready'}
  <p>{t('pistes.empty')}</p>
{:else}
  <ul class="pistes">
    {#each $list.pistes as piste (piste.id)}
      <li>
        <a class="btn piste" href={hrefTo({ name: 'judge', pisteId: piste.id })}>
          <span>{t('pistes.piste', { piste: piste.id })}</span>
          <span class="status">{statusLabel(piste.status)}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<div class="tools">
  <button class="icon" type="button" aria-label={t('pistes.refresh')} title={t('pistes.refresh')} onclick={() => void list.refresh()}>
    <Icon name="retry" />
  </button>
  <a class="icon" href={hrefTo({ name: 'board' })} aria-label={t('nav.board')} title={t('nav.board')}>
    <Icon name="monitor" />
  </a>
</div>
</div>

<style>
  .pistes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .piste {
    justify-content: space-between;
    text-decoration: none;
    width: 100%;
    box-sizing: border-box;
  }
  .status {
    color: var(--muted);
  }
</style>
