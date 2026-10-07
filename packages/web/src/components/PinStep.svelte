<script lang="ts">
  import type { EntryError } from '../controllers/entry-flow';
  import { t } from '../i18n/t';
  import { pinErrorMessage } from './entry-error';

  let { pisteId, error, onsubmit }: { pisteId: string; error: EntryError | null; onsubmit: (pin: string) => void } =
    $props();

  let pin = $state('');

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onsubmit(pin);
    pin = '';
  }
</script>

<h1>{t('pin.title', { piste: pisteId })}</h1>
<p>{t('pin.hint')}</p>

<form onsubmit={submit}>
  <label class="field">
    <span>{t('pin.label')}</span>
    <!-- type=password keeps the digits hidden; inputmode opens the numeric keypad. -->
    <input
      class="pin-input"
      type="password"
      inputmode="numeric"
      pattern="[0-9]*"
      autocomplete="off"
      maxlength="8"
      bind:value={pin}
    />
  </label>
  {#if error}
    <p class="error" role="alert">{pinErrorMessage(error)}</p>
  {/if}
  <button class="btn primary" type="submit">{t('pin.submit')}</button>
</form>

<style>
  .pin-input {
    font-size: 2rem;
    letter-spacing: 0.5em;
    text-align: center;
    width: 100%;
    box-sizing: border-box;
    min-height: 64px;
  }
</style>
