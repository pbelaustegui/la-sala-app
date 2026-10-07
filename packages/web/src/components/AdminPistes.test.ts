// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AdminPistes from './AdminPistes.svelte';

const base = {
  pistes: [{ id: 'p1', pin: '1111' }],
  confirming: null,
  busy: false,
  error: null,
  onrequest: () => undefined,
  onconfirm: () => undefined,
  oncancel: () => undefined,
  onlock: () => undefined,
};

describe('AdminPistes', () => {
  it('requests the typed count as a number', async () => {
    const onrequest = vi.fn();
    render(AdminPistes, { ...base, onrequest });
    await fireEvent.input(screen.getByLabelText('Número de pistas'), { target: { value: '12' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Crear pistas' }));
    expect(onrequest).toHaveBeenCalledWith(12);
  });

  it('shows the confirmation warning for the pending count', () => {
    render(AdminPistes, { ...base, confirming: 5 });
    expect(screen.getByRole('alertdialog').textContent).toContain('5');
  });

  it('shows the empty state and the invalid-count error', () => {
    render(AdminPistes, { ...base, pistes: [], error: 'invalid-count' });
    expect(screen.getByText('Todavía no hay pistas.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('entre 1 y 100');
  });
});
