<script lang="ts">
  import { onMount } from 'svelte';
  import AdminPistes from '../components/AdminPistes.svelte';
  import { AdminSessionController } from '../controllers/admin-session';
  import { getServices } from '../env';
  import { t } from '../i18n/t';

  const { api, adminPin } = getServices();
  const admin = new AdminSessionController(api, adminPin);

  let pin = $state('');

  onMount(() => void admin.start());

  function submitPin(event: SubmitEvent): void {
    event.preventDefault();
    const value = pin;
    pin = '';
    void admin.submitPin(value);
  }
</script>

{#if $admin.step === 'ready'}
  <AdminPistes
    pistes={$admin.pistes}
    confirming={$admin.confirming}
    busy={$admin.busy}
    error={$admin.error}
    onrequest={(count) => admin.requestCreate(count)}
    onconfirm={() => void admin.confirmCreate()}
    oncancel={() => admin.cancelCreate()}
    onlock={() => admin.lock()}
  />
{:else if $admin.step === 'loading'}
  <h1>{t('admin.title')}</h1>
  <p>{t('admin.loading')}</p>
{:else if $admin.step === 'offline'}
  <h1>{t('admin.title')}</h1>
  <p class="notice" role="alert">{t('admin.offline')}</p>
  <button class="btn primary" type="button" onclick={() => void admin.start()}>{t('admin.retry')}</button>
{:else}
  <h1>{t('admin.title')}</h1>
  <p>{t('admin.pin.hint')}</p>
  <form onsubmit={submitPin}>
    <label class="field">
      <span>{t('admin.pin.label')}</span>
      <input type="password" inputmode="numeric" autocomplete="off" bind:value={pin} />
    </label>
    {#if $admin.error === 'wrong-pin'}
      <p class="error" role="alert">{t('admin.pin.wrong')}</p>
    {/if}
    <button class="btn primary" type="submit">{t('admin.pin.submit')}</button>
  </form>
{/if}
