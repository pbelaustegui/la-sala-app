<script lang="ts">
  import { t } from '../i18n/t';

  let { onaccept, oncancel }: { onaccept: () => void; oncancel: () => void } = $props();
</script>

<h1>{t('confirm.title')}</h1>
<p>{t('confirm.body')}</p>
<div class="actions">
  <button class="btn danger" type="button" onclick={onaccept}>{t('confirm.accept')}</button>
  <button class="btn" type="button" onclick={oncancel}>{t('confirm.cancel')}</button>
</div>

<style>
  h1 {
    margin: 0.25rem 0 0.5rem;
  }
  p {
    margin: 0 0 0.5rem;
  }
  .actions {
    gap: 0.5rem;
    margin: 0.6rem 0;
  }
</style>
