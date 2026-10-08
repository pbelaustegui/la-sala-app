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
      <li class="card">
        <div class="head">
          <strong>{t('admin.pistes.piste', { piste: piste.id })}</strong>
          <input
            class="pin"
            readonly
            aria-label={t('admin.pistes.pin', { piste: piste.id })}
            value={piste.pin}
          />
        </div>
        <div class="row">
          <button class="btn" type="button" onclick={() => oncopypin(piste.pin)}>
            {t('admin.copy.pin', { piste: piste.id })}
          </button>
          <a class="btn" href={hrefTo({ name: 'judge', pisteId: piste.id })}>{t('admin.pistes.judge', { piste: piste.id })}</a>
          <a class="btn" href={hrefTo({ name: 'piste', pisteId: piste.id })}>{t('admin.pistes.watch', { piste: piste.id })}</a>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<div class="actions">
  <a class="btn" href={hrefTo({ name: 'board' })}>{t('nav.board')}</a>
  <button class="btn" type="button" onclick={oncopylink}>{t('admin.copy.link')}</button>
  {#if pistes.length > 0}
    <button class="btn" type="button" onclick={oncopyjudges}>{t('admin.copy.judges')}</button>
  {/if}
</div>
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
    <div class="actions">
      <button class="btn danger" type="button" disabled={busy} onclick={onconfirm}>{t('admin.confirm.yes')}</button>
      <button class="btn" type="button" disabled={busy} onclick={oncancel}>{t('admin.confirm.cancel')}</button>
    </div>
  </div>
{/if}

<div class="actions">
  <button class="btn" type="button" onclick={onlock}>{t('admin.lock')}</button>
</div>

<style>
  .pistes {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .card {
    display: grid;
    gap: 0.75rem;
    padding: 0.75rem;
    border: 2px solid var(--muted);
    border-radius: 0.75rem;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
    gap: 0.5rem;
  }
  .pin {
    font-size: 1.5rem;
    font-variant-numeric: tabular-nums;
    width: 7rem;
    text-align: center;
    min-height: var(--tap);
    color: var(--fg);
    background: #141b36;
    border: 2px solid var(--muted);
    border-radius: 0.5rem;
  }
  .confirm {
    margin: 1rem 0;
  }
</style>
