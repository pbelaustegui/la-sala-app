<script lang="ts">
  import { onMount } from 'svelte';
  import ChooseStep from '../components/ChooseStep.svelte';
  import ConfirmNewStep from '../components/ConfirmNewStep.svelte';
  import PinStep from '../components/PinStep.svelte';
  import SetupStep from '../components/SetupStep.svelte';
  import { EntryFlow } from '../controllers/entry-flow';
  import { getServices } from '../env';
  import { t } from '../i18n/t';
  import ScoreboardScreen from './ScoreboardScreen.svelte';

  let { pisteId }: { pisteId: string } = $props();

  const { api, pins, pointer, env } = getServices();
  // The route re-creates this screen per piste (`{#key}`), so the id is fixed here.
  // svelte-ignore state_referenced_locally
  const flow = new EntryFlow({ pisteId, api, pins, pointer, storage: env.storage, newId: env.newId });

  onMount(() => void flow.start());
</script>

{#if $flow.step === 'checking'}
  <p>{t('pin.checking')}</p>
{:else if $flow.step === 'pin'}
  <PinStep {pisteId} error={$flow.error} onsubmit={(pin) => void flow.submitPin(pin)} />
{:else if $flow.step === 'choose'}
  <ChooseStep left={$flow.left} right={$flow.right} onresume={() => flow.resume()} onnew={() => flow.requestNewBout()} />
{:else if $flow.step === 'confirm-new'}
  <ConfirmNewStep onaccept={() => flow.confirmNewBout()} oncancel={() => flow.cancelNewBout()} />
{:else if $flow.step === 'setup'}
  <SetupStep
    errors={$flow.errors}
    failure={$flow.failure}
    submitting={$flow.submitting}
    onsubmit={(form) => void flow.startBout(form)}
  />
{:else if $flow.step === 'offline'}
  <h1>{t('entry.offline.title')}</h1>
  <p>{t('entry.offline.body')}</p>
  <button class="btn primary" type="button" onclick={() => void flow.start()}>{t('entry.offline.retry')}</button>
{:else}
  {#key $flow.boutId}
    <ScoreboardScreen
      {pisteId}
      pin={$flow.pin}
      bout={$flow.bout}
      startedOffline={$flow.offline}
      onreauth={() => flow.changePin()}
      onnewbout={() => flow.startNewBout()}
    />
  {/key}
{/if}
