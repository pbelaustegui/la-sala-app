// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.svelte';

afterEach(() => {
  window.location.hash = '';
});

describe('App shell', () => {
  it('renders the home screen at #/', () => {
    render(App);
    expect(screen.getByText('Elige una pista para empezar a arbitrar.')).toBeTruthy();
  });

  it('renders the judge placeholder for #/judge/:pisteId', () => {
    window.location.hash = '#/judge/p7';
    render(App);
    expect(screen.getByRole('heading', { name: 'Pista p7' })).toBeTruthy();
  });

  it('renders not-found for unknown routes', () => {
    window.location.hash = '#/zzz';
    render(App);
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeTruthy();
  });
});
