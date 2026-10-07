<script lang="ts">
  import { t } from '../i18n/t';

  let {
    left,
    right,
    onresume,
    onnew,
  }: { left: string; right: string; onresume: () => void; onnew: () => void } = $props();
</script>

<h1>{t('choose.title')}</h1>
<p>{t('choose.body', { left, right })}</p>
<div class="actions">
  <button class="btn primary" type="button" onclick={onresume}>{t('choose.resume')}</button>
  <button class="btn" type="button" onclick={onnew}>{t('choose.new')}</button>
</div>
