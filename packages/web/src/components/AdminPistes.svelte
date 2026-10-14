<script lang="ts">
  import type { AdminPiste } from '../core/api-client';
  import { t } from '../i18n/t';
  import { hrefTo } from '../router';
  import Icon from './Icon.svelte';
  import NumberField from './NumberField.svelte';

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

  let count = $state('');

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onrequest(count.trim() === '' ? Number.NaN : Number(count));
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
          <button class="icon labeled" type="button" aria-label={t('admin.copy.pin', { piste: piste.id })} title={t('admin.short.copyPin')} onclick={() => oncopypin(piste.pin)}>
            <Icon name="copy" /><span>{t('admin.short.copyPin')}</span>
          </button>
          <a class="icon" href={hrefTo({ name: 'judge', pisteId: piste.id })} aria-label={t('admin.pistes.judge', { piste: piste.id })} title={t('admin.short.judge')}>
            <Icon name="flag" />
          </a>
          <a class="icon" href={hrefTo({ name: 'piste', pisteId: piste.id })} aria-label={t('admin.pistes.watch', { piste: piste.id })} title={t('admin.short.watch')}>
            <Icon name="eye" />
          </a>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<div class="tools">
  <a class="icon" href={hrefTo({ name: 'board' })} aria-label={t('nav.board')} title={t('nav.board')}><Icon name="monitor" /></a>
  <button class="icon labeled" type="button" aria-label={t('admin.copy.link')} title={t('admin.copy.link')} onclick={oncopylink}><Icon name="link" /><span>{t('admin.short.copyLink')}</span></button>
  {#if pistes.length > 0}
    <button class="icon labeled" type="button" aria-label={t('admin.copy.judges')} title={t('admin.copy.judges')} onclick={oncopyjudges}><Icon name="users" /><span>{t('admin.short.copyJudges')}</span></button>
  {/if}
  <button class="icon danger" type="button" aria-label={t('admin.lock')} title={t('admin.lock')} onclick={onlock}><Icon name="lock" /></button>
</div>
<p role="status" class:error={copyResult === 'failed'}>
  {#if copyResult === 'done'}{t('admin.copy.done')}{:else if copyResult === 'failed'}{t('admin.copy.failed')}{/if}
</p>

<h2>{t('admin.create.title')}</h2>
<form onsubmit={submit}>
  <NumberField label={t('admin.create.count')} bind:value={count} min={1} max={100} />
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

<style>
  h2 {
    margin: 0.75rem 0 0.4rem;
    font-size: 1.15rem;
  }
  .pistes {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .row {
    display: flex;
    gap: 0.4rem;
  }
  .pin {
    width: 5rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }
  .confirm {
    margin: 0.6rem 0;
  }
</style>
