import type { AdminPiste } from './api-client';
import { t } from '../i18n/t';
import { hrefTo } from '../router';

/** The text an organizer sends to judges: the judge entry link and each piste with its PIN. */
export function judgeShareMessage(origin: string, pistes: readonly AdminPiste[]): string {
  const link = `${origin.replace(/\/+$/, '')}/${hrefTo({ name: 'judge-list' })}`;
  return [
    t('admin.share.link', { link }),
    ...pistes.map((piste) => t('admin.share.piste', { piste: piste.id, pin: piste.pin })),
  ].join('\n');
}
