// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.svelte';
import { FakeServer } from './core/testing/fake-server';
import { createMemoryEnv } from './testing/memory-env';

const PIN = '4821';

function setup() {
  const server = new FakeServer({ pisteId: 'p1', pin: PIN, serverNow: () => Date.now() });
  const env = createMemoryEnv({ fetch: server.fetch });
  return { server, env };
}

async function enterPin(pin: string) {
  await fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: pin } });
  await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

afterEach(() => {
  window.location.hash = '';
});

describe('App shell', () => {
  it('renders not-found for unknown routes', () => {
    window.location.hash = '#/zzz';
    render(App, { env: createMemoryEnv() });
    expect(screen.getByRole('heading', { name: 'Página no encontrada' })).toBeTruthy();
  });
});

describe('piste list', () => {
  it('lists the pistes with their status', async () => {
    const { env } = setup();
    render(App, { env });
    expect(await screen.findByText('Pista p1')).toBeTruthy();
    expect(screen.getByText('Libre')).toBeTruthy();
  });

  it('tells the judge when the pistes cannot be loaded and lets them retry', async () => {
    const { env, server } = setup();
    server.down = true;
    render(App, { env });
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('No se pueden cargar las pistas'));
    server.down = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(await screen.findByText('Pista p1')).toBeTruthy();
  });

  it('links a piste to its judge screen', async () => {
    const { env } = setup();
    render(App, { env });
    const link = await screen.findByRole('link', { name: /Pista p1/ });
    expect(link.getAttribute('href')).toBe('#/judge/p1');
  });
});

describe('judge entry', () => {
  it('shows a clear message for a wrong PIN', async () => {
    const { env } = setup();
    window.location.hash = '#/judge/p1';
    render(App, { env });
    await enterPin('0000');
    expect((await screen.findByRole('alert')).textContent).toBe('PIN incorrecto. Inténtalo de nuevo.');
    expect(env.sessionStorage.get('la-sala:v1:pin:p1')).toBeNull();
  });

  it('shows the lockout with the seconds to wait', async () => {
    const { env, server } = setup();
    window.location.hash = '#/judge/p1';
    render(App, { env });
    server.forceStatus = { status: 429, headers: { 'retry-after': '30' } };
    await enterPin(PIN);
    expect((await screen.findByRole('alert')).textContent).toContain('Espera 30 s');
  });

  it('validates the setup form before posting it', async () => {
    const { env, server } = setup();
    window.location.hash = '#/judge/p1';
    render(App, { env });
    await enterPin(PIN);
    await fireEvent.click(await screen.findByRole('button', { name: 'Empezar combate' }));
    expect((await screen.findAllByText('Escribe el nombre.')).length).toBe(2);
    expect(server.requests.filter((r) => r.path.endsWith('/bout'))).toHaveLength(0);
  });

  it('starts a bout from the setup form and remembers the PIN for the session', async () => {
    const { env, server } = setup();
    window.location.hash = '#/judge/p1';
    render(App, { env });
    await enterPin(PIN);
    await fireEvent.click(await screen.findByLabelText('Espada'));
    await fireEvent.click(screen.getByLabelText('2 periodos'));
    await fireEvent.input(screen.getByLabelText('Tirador izquierda'), { target: { value: 'Ana' } });
    await fireEvent.input(screen.getByLabelText('Tirador derecha'), { target: { value: 'Bea' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Empezar combate' }));

    expect(await screen.findByRole('heading', { name: 'Pista p1' })).toBeTruthy();
    expect(server.setup).toMatchObject({ weapon: 'epee', left: 'Ana', right: 'Bea', options: { periods: 2 } });
    expect(env.sessionStorage.get('la-sala:v1:pin:p1')).toBe(PIN);
  });

  it('asks before archiving a live bout with a new one', async () => {
    const { env, server } = setup();
    server.setup = { weapon: 'foil', left: 'Ana', right: 'Bea' };
    window.location.hash = '#/judge/p1';
    render(App, { env });
    await enterPin(PIN);
    expect(await screen.findByText('Ana contra Bea.')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Nuevo combate' }));
    expect(screen.getByText(/se archivará/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Reanudar combate' })).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Nuevo combate' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Sí, archivar y continuar' }));
    expect(await screen.findByRole('heading', { name: 'Nuevo combate' })).toBeTruthy();
  });

  it('says so when the piste cannot be opened offline', async () => {
    const { env, server } = setup();
    env.sessionStorage.set('la-sala:v1:pin:p1', PIN);
    server.down = true;
    window.location.hash = '#/judge/p1';
    render(App, { env });
    expect(await screen.findByRole('heading', { name: 'Sin conexión' })).toBeTruthy();
  });
});
