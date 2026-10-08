<script lang="ts">
  import type { AdminPiste } from '../core/api-client';
  import { t } from '../i18n/t';
  import { hrefTo } from '../router';

  let {
    pistes,
    confirming,
    busy,
    error,
    copyResult,
    oncopypin,
    oncopylink,
    oncopyjudges,
    onrequest,
    onconfirm,
    oncancel,
    onlock,
  }: {
    pistes: readonly AdminPiste[];
    confirming: number | null;
    busy: boolean;
    error: 'invalid-count' | 'failed' | 'wrong-pin' | null;
    copyResult: 'done' | 'failed' | null;
    oncopypin: (pin: string) => void;
    oncopylink: () => void;
    oncopyjudges: () => void;
    onrequest: (count: number) => void;
    onconfirm: () => void;
    oncancel: () => void;
    onlock: () => void;
  } = $props();

  // A number input binds to a number, or null while empty or unparsable.
  let count = $state<number | null>(null);

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onrequest(count ?? Number.NaN);
  }
</script>

<h1>{t('admin.title')}</h1>

<h2>{t('admin.pistes.title')}</h2>
{#if pistes.length === 0}
  <p>{t('admin.pistes.empty')}</p>
{:else}
  <ul class="pistes">
    {#each pistes as piste (piste.id)}
      <li>
        <span>{t('admin.pistes.piste', { piste: piste.id })}</span>
        <input
          class="pin"
          readonly
          aria-label={t('admin.pistes.pin', { piste: piste.id })}
          value={piste.pin}
        />
        <button class="btn" type="button" onclick={() => oncopypin(piste.pin)}>
          {t('admin.copy.pin', { piste: piste.id })}
        </button>
        <a href={hrefTo({ name: 'judge', pisteId: piste.id })}>{t('admin.pistes.judge', { piste: piste.id })}</a>
        <a href={hrefTo({ name: 'piste', pisteId: piste.id })}>{t('admin.pistes.watch', { piste: piste.id })}</a>
      </li>
    {/each}
  </ul>
{/if}

<p><a href={hrefTo({ name: 'board' })}>{t('nav.board')}</a></p>
<p><button class="btn" type="button" onclick={oncopylink}>{t('admin.copy.link')}</button></p>
{#if pistes.length > 0}
  <p><button class="btn" type="button" onclick={oncopyjudges}>{t('admin.copy.judges')}</button></p>
{/if}
<p role="status" class:error={copyResult === 'failed'}>
  {#if copyResult === 'done'}{t('admin.copy.done')}{:else if copyResult === 'failed'}{t('admin.copy.failed')}{/if}
</p>

<h2>{t('admin.create.title')}</h2>
<form onsubmit={submit}>
  <label class="field">
    <span>{t('admin.create.count')}</span>
    <input type="number" inputmode="numeric" min="1" max="100" step="1" bind:value={count} />
  </label>
  {#if error === 'invalid-count'}
    <p class="error" role="alert">{t('admin.create.invalid')}</p>
  {:else if error === 'failed'}
    <p class="error" role="alert">{t('admin.create.failed')}</p>
  {/if}
  <button class="btn primary" type="submit" disabled={busy || confirming !== null}>{t('admin.create.submit')}</button>
</form>

{#if confirming !== null}
  <div class="confirm notice" role="alertdialog" aria-label={t('admin.create.title')}>
    <p>{t('admin.confirm.warning', { count: confirming })}</p>
    <button class="btn danger" type="button" disabled={busy} onclick={onconfirm}>{t('admin.confirm.yes')}</button>
    <button class="btn" type="button" disabled={busy} onclick={oncancel}>{t('admin.confirm.cancel')}</button>
  </div>
{/if}

<p><button class="btn" type="button" onclick={onlock}>{t('admin.lock')}</button></p>

<style>
  .pistes {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .pistes li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem 1rem;
  }
  .pin {
    font-size: 1.25rem;
    font-variant-numeric: tabular-nums;
    width: 8rem;
    text-align: center;
  }
  .confirm {
    margin: 1rem 0;
  }
</style>
