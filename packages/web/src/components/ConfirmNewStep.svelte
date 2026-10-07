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
