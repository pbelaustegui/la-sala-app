<script lang="ts">
  import { onMount } from 'svelte';
  import { PisteListController } from '../controllers/piste-list';
  import { getServices } from '../env';
  import { es } from '../i18n/es';
  import { t, type CopyKey } from '../i18n/t';
  import { hrefTo } from '../router';

  const { api } = getServices();
  const list = new PisteListController(api);

  onMount(() => void list.refresh());

  function statusLabel(status: string): string {
    const key = `pistes.status.${status}`;
    return key in es ? t(key as CopyKey) : t('pistes.status.unknown');
  }
</script>

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

<div class="actions">
  <button class="btn" type="button" onclick={() => void list.refresh()}>{t('pistes.refresh')}</button>
  <a class="btn" href={hrefTo({ name: 'board' })}>{t('nav.board')}</a>
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
