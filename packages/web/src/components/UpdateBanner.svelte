<script lang="ts">
  import type { UpdateNotice } from '../core/update-notice';
  import { t } from '../i18n/t';

  let { notice }: { notice: UpdateNotice } = $props();
</script>

{#if $notice.updateAvailable}
  <div class="banner" role="status">
    <p>{t('pwa.update.available')}</p>
    <div class="actions">
      <button class="btn primary" type="button" onclick={() => notice.apply()}>{t('pwa.update.apply')}</button>
      <button class="btn" type="button" onclick={() => notice.dismiss()}>{t('pwa.update.later')}</button>
    </div>
  </div>
{:else if $notice.offlineReady}
  <div class="banner" role="status">
    <p>{t('pwa.offlineReady')}</p>
    <div class="actions">
      <button class="btn" type="button" onclick={() => notice.dismiss()}>{t('pwa.dismiss')}</button>
    </div>
  </div>
{/if}

<style>
  .banner {
    width: calc(100% - 2rem);
    max-width: 40rem;
    margin: 0.5rem auto;
    padding: 0.75rem 1rem;
    border: 2px solid var(--accent);
    border-radius: 0.75rem;
    box-sizing: border-box;
  }
  p {
    margin: 0;
  }
  .actions {
    margin: 0.5rem 0 0;
  }
</style>
