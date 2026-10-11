<script lang="ts">
  import type { UpdateNotice } from '../core/update-notice';
  import { t } from '../i18n/t';

  let { notice }: { notice: UpdateNotice } = $props();
</script>

{#if $notice.updateAvailable}
  <div class="notice" role="status">
    <p>{t('pwa.update.available')}</p>
    <div class="actions">
      <button class="btn primary" type="button" onclick={() => notice.apply()}>{t('pwa.update.apply')}</button>
      <button class="btn" type="button" onclick={() => notice.dismiss()}>{t('pwa.update.later')}</button>
    </div>
  </div>
{:else if $notice.offlineReady}
  <div class="notice" role="status">
    <p>{t('pwa.offlineReady')}</p>
    <div class="actions">
      <button class="btn" type="button" onclick={() => notice.dismiss()}>{t('pwa.dismiss')}</button>
    </div>
  </div>
{/if}

<style>
  .notice {
    width: calc(100% - 2rem);
    max-width: 40rem;
    margin: 0.5rem auto;
    box-sizing: border-box;
  }
  .actions {
    margin: 0.5rem 0 0;
  }
</style>
