// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import NumberField from './NumberField.svelte';

function mount(props: Record<string, unknown> = {}) {
  render(NumberField, { label: 'Tocados', value: '3', ...props });
  return screen.getByLabelText('Tocados') as HTMLInputElement;
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

afterEach(cleanup);

describe('NumberField', () => {
  it('steps the value up and down with its buttons', async () => {
    const input = mount();
    await click('Sumar uno: Tocados');
    expect(input.value).toBe('4');
    await click('Restar uno: Tocados');
    await click('Restar uno: Tocados');
    expect(input.value).toBe('2');
  });

  it('stops at the bounds and disables the button there', async () => {
    const input = mount({ value: '1', min: 1, max: 2 });
    expect((screen.getByRole('button', { name: 'Restar uno: Tocados' }) as HTMLButtonElement).disabled).toBe(true);
    await click('Sumar uno: Tocados');
    expect(input.value).toBe('2');
    expect((screen.getByRole('button', { name: 'Sumar uno: Tocados' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts from the minimum when the field is blank', async () => {
    const input = mount({ value: '', min: 1 });
    await click('Sumar uno: Tocados');
    expect(input.value).toBe('1');
  });

  it('keeps only digits when typing and opens the numeric keypad', async () => {
    const input = mount();
    expect(input.getAttribute('inputmode')).toBe('numeric');
    await fireEvent.input(input, { target: { value: '1a2-' } });
    expect(input.value).toBe('12');
  });
});
