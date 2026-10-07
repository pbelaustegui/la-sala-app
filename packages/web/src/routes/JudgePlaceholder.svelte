<script lang="ts">
  import { t } from '../i18n/t';
  import { hrefTo } from '../router';

  let { pisteId }: { pisteId: string } = $props();
</script>

<h1>{t('judge.title', { piste: pisteId })}</h1>
<p>{t('judge.placeholder')}</p>
<a href={hrefTo({ name: 'home' })}>{t('nav.back')}</a>
