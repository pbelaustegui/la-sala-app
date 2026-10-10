<script lang="ts">
  import type { Weapon } from '@la-sala/domain';
  import type { EntryError } from '../controllers/entry-flow';
  import { EMPTY_SETUP_FORM, type SetupErrors, type SetupForm } from '../core/setup-form';
  import { t } from '../i18n/t';
  import { setupFailureMessage } from './entry-error';

  let {
    errors,
    failure,
    submitting,
    onsubmit,
  }: {
    errors: SetupErrors;
    failure: EntryError | null;
    submitting: boolean;
    onsubmit: (form: SetupForm) => void;
  } = $props();

  let weapon = $state<Weapon>(EMPTY_SETUP_FORM.weapon);
  let periods = $state<1 | 2 | 3>(EMPTY_SETUP_FORM.periods);
  let touchLimit = $state('');
  let left = $state('');
  let right = $state('');

  const WEAPONS: readonly Weapon[] = ['foil', 'epee', 'sabre'];
  const PERIODS = [1, 2, 3] as const;

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onsubmit({ weapon, periods, touchLimit, left, right });
  }
</script>

<h1>{t('setup.title')}</h1>

<form onsubmit={submit} novalidate>
  <fieldset>
    <legend>{t('setup.weapon')}</legend>
    <div class="choices">
      {#each WEAPONS as option (option)}
        <label class="choice">
          <input type="radio" name="weapon" value={option} bind:group={weapon} />
          <span>{t(`setup.weapon.${option}`)}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <fieldset>
    <legend>{t('setup.periods')}</legend>
    <div class="choices">
      {#each PERIODS as option (option)}
        <label class="choice">
          <input type="radio" name="periods" value={option} bind:group={periods} />
          <span>{t(`setup.periods.${option}`)}</span>
        </label>
      {/each}
    </div>
  </fieldset>

  <label class="field">
    <span>{t('setup.touchLimit')}</span>
    <input type="text" inputmode="numeric" autocomplete="off" bind:value={touchLimit} aria-invalid={errors.touchLimit ? 'true' : undefined} />
    <small>{t('setup.touchLimit.hint')}</small>
    {#if errors.touchLimit}<span class="error" role="alert">{t(errors.touchLimit)}</span>{/if}
  </label>

  <label class="field">
    <span>{t('setup.left')}</span>
    <input type="text" autocomplete="off" maxlength="200" bind:value={left} aria-invalid={errors.left ? 'true' : undefined} />
    {#if errors.left}<span class="error" role="alert">{t(errors.left)}</span>{/if}
  </label>

  <label class="field">
    <span>{t('setup.right')}</span>
    <input type="text" autocomplete="off" maxlength="200" bind:value={right} aria-invalid={errors.right ? 'true' : undefined} />
    {#if errors.right}<span class="error" role="alert">{t(errors.right)}</span>{/if}
  </label>

  {#if failure}
    <p class="error" role="alert">{setupFailureMessage(failure)}</p>
  {/if}

  <div class="actions">
    <button class="btn primary" type="submit" disabled={submitting}>
      {submitting ? t('setup.submitting') : t('setup.submit')}
    </button>
  </div>
</form>

<style>
  /* Air below the submit button, so it can scroll clear of the keyboard and its suggestion strip. */
  form {
    padding-bottom: 1.5rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }
  .choices {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .choice {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: var(--tap);
    padding: 0 0.75rem;
    border: 2px solid var(--muted);
    border-radius: 0.5rem;
  }
  .choice input {
    width: 1.5rem;
    height: 1.5rem;
  }
</style>
