import { describe, expect, it } from 'vitest';
import { es } from './es';
import { t } from './t';

describe('t', () => {
  it('returns the Spanish copy for a key', () => {
    expect(t('app.title')).toBe(es['app.title']);
  });

  it('interpolates {name} placeholders', () => {
    expect(t('judge.title', { piste: 'A1' })).toContain('A1');
  });

  it('has no empty copy', () => {
    for (const value of Object.values(es)) expect(value.trim()).not.toBe('');
  });
});
