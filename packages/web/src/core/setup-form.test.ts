import { describe, expect, it } from 'vitest';
import { EMPTY_SETUP_FORM, MAX_NAME_LENGTH, validateSetupForm, type SetupForm } from './setup-form';

const valid: SetupForm = { ...EMPTY_SETUP_FORM, left: 'Ana', right: 'Bea', touchLimit: '5' };

describe('validateSetupForm', () => {
  it('defaults to a 3 period foil bout', () => {
    const result = validateSetupForm(valid);
    expect(result).toEqual({ ok: true, setup: { weapon: 'foil', options: { periods: 3, touchLimit: 5 }, left: 'Ana', right: 'Bea' } });
  });

  it('trims names and the touch limit', () => {
    const result = validateSetupForm({ ...valid, left: '  Ana ', touchLimit: ' 5 ', weapon: 'sabre', periods: 1 });
    expect(result).toEqual({
      ok: true,
      setup: { weapon: 'sabre', options: { periods: 1, touchLimit: 5 }, left: 'Ana', right: 'Bea' },
    });
  });

  it('requires both names', () => {
    const result = validateSetupForm({ ...valid, left: '   ', right: '' });
    expect(result).toEqual({ ok: false, errors: { left: 'setup.error.nameRequired', right: 'setup.error.nameRequired' } });
  });

  it('mirrors the server name length limit', () => {
    const tooLong = 'x'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateSetupForm({ ...valid, right: tooLong })).toEqual({
      ok: false,
      errors: { right: 'setup.error.nameTooLong' },
    });
    expect(validateSetupForm({ ...valid, right: 'x'.repeat(MAX_NAME_LENGTH) }).ok).toBe(true);
  });

  it.each(['0', '-3', '2.5', 'abc', '1e2'])('rejects touch limit %j', (touchLimit) => {
    expect(validateSetupForm({ ...valid, touchLimit })).toEqual({
      ok: false,
      errors: { touchLimit: 'setup.error.touchLimit' },
    });
  });

  it.each(['', '   '])('requires a touch limit (%j)', (touchLimit) => {
    expect(validateSetupForm({ ...valid, touchLimit })).toEqual({
      ok: false,
      errors: { touchLimit: 'setup.error.touchLimitRequired' },
    });
  });

  it('starts with a blank touch limit so the judge must choose one', () => {
    expect(EMPTY_SETUP_FORM.touchLimit).toBe('');
  });
});
