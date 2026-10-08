// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../App.svelte';
import type { FetchLike } from '../core/api-client';
import { createMemoryEnv, FakeClipboard } from '../testing/memory-env';

const ADMIN_PIN = '9999';

/** Minimal admin server: GET and POST /admin/pistes behind `x-admin-pin`. */
function adminServer() {
  let pistes = [{ id: 'p1', pin: '1111' }];
  const requests: { method: string; body: unknown }[] = [];
  const fetch: FetchLike = async (path, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (path !== '/admin/pistes') return Response.json({}, { status: 404 });
    if (headers['x-admin-pin'] !== ADMIN_PIN) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ method: init?.method ?? 'GET', body });
    if (init?.method === 'POST') {
      pistes = Array.from({ length: body.count }, (_, i) => ({ id: `p${i + 1}`, pin: `${2000 + i}` }));
      return Response.json(pistes, { status: 201 });
    }
    return Response.json(pistes);
  };
  return { fetch, requests };
}

async function enterPin(pin: string) {
  await fireEvent.input(await screen.findByLabelText('PIN del organizador'), { target: { value: pin } });
  await fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

beforeEach(() => {
  window.location.hash = '#/admin';
});
afterEach(() => {
  window.location.hash = '';
});

describe('AdminScreen', () => {
  it('lists the pistes with their PINs after a correct admin PIN', async () => {
    const server = adminServer();
    render(App, { env: createMemoryEnv({ fetch: server.fetch }) });
    await enterPin(ADMIN_PIN);
    expect(await screen.findByText('Pista p1')).toBeTruthy();
    expect(screen.getByDisplayValue('1111')).toBeTruthy();
    expect(screen.queryByDisplayValue(ADMIN_PIN)).toBeNull();
  });

  it('links to the public board and, per piste, to its judge screen and spectator detail', async () => {
    render(App, { env: createMemoryEnv({ fetch: adminServer().fetch }) });
    await enterPin(ADMIN_PIN);
    await screen.findByText('Pista p1');
    expect(screen.getByRole('link', { name: 'Ver el marcador público' }).getAttribute('href')).toBe('#/');
    expect(screen.getByRole('link', { name: 'Arbitrar la pista p1' }).getAttribute('href')).toBe('#/judge/p1');
    expect(screen.getByRole('link', { name: 'Ver la pista p1 como espectador' }).getAttribute('href')).toBe('#/piste/p1');
    // PINs never travel in a URL.
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toContain('1111');
  });

  it('stays on PIN entry with an error for a wrong PIN', async () => {
    render(App, { env: createMemoryEnv({ fetch: adminServer().fetch }) });
    await enterPin('0000');
    expect((await screen.findByRole('alert')).textContent).toContain('PIN incorrecto');
    expect(screen.getByLabelText('PIN del organizador')).toBeTruthy();
  });

  it('asks for confirmation before replacing the pistes, then shows the new list', async () => {
    const server = adminServer();
    render(App, { env: createMemoryEnv({ fetch: server.fetch }) });
    await enterPin(ADMIN_PIN);
    await fireEvent.input(await screen.findByLabelText('Número de pistas'), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Crear pistas' }));

    expect(screen.getByRole('alertdialog').textContent).toContain('todas las pistas y combates');
    expect(server.requests.some((r) => r.method === 'POST')).toBe(false);

    await fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar todo' }));
    expect(await screen.findByText('Pista p2')).toBeTruthy();
    expect(server.requests.at(-1)).toEqual({ method: 'POST', body: { count: 2 } });
  });

  it('cancelling the confirmation sends nothing', async () => {
    const server = adminServer();
    render(App, { env: createMemoryEnv({ fetch: server.fetch }) });
    await enterPin(ADMIN_PIN);
    await fireEvent.input(await screen.findByLabelText('Número de pistas'), { target: { value: '3' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Crear pistas' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(server.requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('remembers the PIN for the session and skips PIN entry on reload', async () => {
    const server = adminServer();
    const env = createMemoryEnv({ fetch: server.fetch });
    const first = render(App, { env });
    await enterPin(ADMIN_PIN);
    await screen.findByText('Pista p1');
    first.unmount();
    render(App, { env });
    expect(await screen.findByText('Pista p1')).toBeTruthy();
  });

  it('shows an offline notice and lists the pistes after retrying', async () => {
    const server = adminServer();
    let down = true;
    const fetch: FetchLike = async (path, init) => {
      if (down) throw new TypeError('network down');
      return server.fetch(path, init);
    };
    const env = createMemoryEnv({ fetch });
    env.sessionStorage.set('la-sala:v1:admin-pin', ADMIN_PIN);
    render(App, { env });
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudo cargar la lista');
    down = false;
    await fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Pista p1')).toBeTruthy();
  });

  it('shows a failure message when creating the pistes fails, keeping the list', async () => {
    const server = adminServer();
    const fetch: FetchLike = async (path, init) =>
      init?.method === 'POST' ? Response.json({ error: 'boom' }, { status: 500 }) : server.fetch(path, init);
    render(App, { env: createMemoryEnv({ fetch }) });
    await enterPin(ADMIN_PIN);
    await fireEvent.input(await screen.findByLabelText('Número de pistas'), { target: { value: '2' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Crear pistas' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar todo' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron crear las pistas');
    expect(screen.getByText('Pista p1')).toBeTruthy();
  });

  it('never persists the admin PIN outside session storage', async () => {
    const env = createMemoryEnv({ fetch: adminServer().fetch });
    render(App, { env });
    await enterPin(ADMIN_PIN);
    await screen.findByText('Pista p1');
    expect(env.storage.get('la-sala:v1:admin-pin')).toBeNull();
    expect(env.sessionStorage.get('la-sala:v1:admin-pin')).toBe(ADMIN_PIN);
  });

  describe('copying', () => {
    async function openList(clipboard: FakeClipboard) {
      render(App, { env: createMemoryEnv({ fetch: adminServer().fetch, clipboard, origin: 'https://sala.example' }) });
      await enterPin(ADMIN_PIN);
      await screen.findByText('Pista p1');
    }

    it('copies a piste PIN and confirms it', async () => {
      const clipboard = new FakeClipboard();
      await openList(clipboard);
      await fireEvent.click(screen.getByRole('button', { name: 'Copiar PIN de la pista p1' }));
      expect(clipboard.writes).toEqual(['1111']);
      expect((await screen.findByRole('status')).textContent).toContain('Copiado');
    });

    it('copies the spectator link built from the current origin', async () => {
      const clipboard = new FakeClipboard();
      await openList(clipboard);
      await fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace de espectador' }));
      expect(clipboard.writes).toEqual(['https://sala.example/#/']);
      expect((await screen.findByRole('status')).textContent).toContain('Copiado');
    });

    it('says so when the clipboard is unavailable', async () => {
      const clipboard = new FakeClipboard();
      clipboard.failing = true;
      await openList(clipboard);
      await fireEvent.click(screen.getByRole('button', { name: 'Copiar PIN de la pista p1' }));
      expect((await screen.findByRole('status')).textContent).toContain('No se pudo copiar');
      expect(clipboard.writes).toEqual([]);
    });
  });
});
