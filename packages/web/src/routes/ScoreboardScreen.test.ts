// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App.svelte';
import { FakeServer } from '../core/testing/fake-server';
import { FakeTimers } from '../testing/fake-timers';
import { createMemoryEnv } from '../testing/memory-env';

const PIN = '4821';

type Setup = NonNullable<FakeServer['setup']>;

function harness(setup: Setup = { weapon: 'epee', left: 'Ana', right: 'Bea' }) {
  let phone = 1_000_000;
  const server = new FakeServer({ pisteId: 'p1', pin: PIN, serverNow: () => phone });
  server.setup = setup;
  const timers = new FakeTimers();
  const online = new Set<() => void>();
  const env = createMemoryEnv({
    fetch: server.fetch,
    now: () => phone,
    timers,
    onOnline: (callback) => {
      online.add(callback);
      return () => void online.delete(callback);
    },
  });
  env.sessionStorage.set('la-sala:v1:pin:p1', PIN);
  return {
    server,
    env,
    timers,
    /** Moves the phone clock and lets the UI tick once. */
    elapse: async (ms: number) => {
      phone += ms;
      timers.fireAll();
      await tick();
    },
    goOnline: () => online.forEach((callback) => callback()),
  };
}

async function open(h: ReturnType<typeof harness>) {
  window.location.hash = '#/judge/p1';
  render(App, { env: h.env });
  await fireEvent.click(await screen.findByRole('button', { name: 'Reanudar combate' }));
  await screen.findAllByRole('button', { name: /^Tocado para/ });
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const score = (side: 'left' | 'right') =>
  screen.getByRole('button', { name: side === 'left' ? 'Tocado para Ana' : 'Tocado para Bea' }).querySelector('.score')
    ?.textContent;

afterEach(() => {
  window.location.hash = '';
});

describe('scoreboard', () => {
  it('tells the judge which piste they are scoring', async () => {
    await open(harness());
    expect(screen.getByRole('heading', { name: 'Pista p1' })).toBeTruthy();
  });

  it('shows the names, the clock and locks scoring until the clock starts', async () => {
    const h = harness();
    await open(h);
    expect(screen.getByText('3:00')).toBeTruthy();
    expect(screen.getByText('Listo para empezar')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Tocado para Ana' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('tapping a half scores a touch for that side and syncs it', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(5_000);
    await click('Tocado para Bea');

    expect(score('right')).toBe('1');
    expect(score('left')).toBe('0');
    await waitFor(() => expect(screen.getByText('Todo sincronizado')).toBeTruthy());
    expect(h.server.events.map((e) => e.event.type)).toEqual(['clock-started', 'touch-scored']);
  });

  it('the clock button stops and restarts the clock', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(10_000);
    await click('Parar reloj');
    expect(screen.getByText('2:50')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar reloj' })).toBeTruthy();
  });

  it('the clock button shows a play icon while stopped and a pause icon while running', async () => {
    const h = harness();
    await open(h);
    const stopped = screen.getByRole('button', { name: 'Iniciar reloj' });
    expect(stopped.querySelector('[data-icon="play"]')).toBeTruthy();
    expect(stopped.querySelector('[data-icon="pause"]')).toBeNull();

    await click('Iniciar reloj');
    const running = screen.getByRole('button', { name: 'Parar reloj' });
    expect(running.querySelector('[data-icon="pause"]')).toBeTruthy();
    expect(running.querySelector('[data-icon="play"]')).toBeNull();
  });

  it('undo reverts a mis-tap', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Tocado para Ana');
    expect(score('left')).toBe('1');
    await click('Deshacer');
    expect(score('left')).toBe('0');
  });

  it('epee offers a double touch that scores both sides', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Doble toque');
    expect(score('left')).toBe('1');
    expect(score('right')).toBe('1');
  });

  it('foil has no double touch button', async () => {
    const h = harness({ weapon: 'foil', left: 'Ana', right: 'Bea' });
    await open(h);
    expect(screen.queryByRole('button', { name: 'Doble toque' })).toBeNull();
  });

  it('gives a card from the cards sheet', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Tarjetas');
    await click('Tarjeta roja a Ana');
    // A red card is a touch for the opponent.
    expect(score('right')).toBe('1');
    expect(screen.queryByRole('group', { name: 'Tarjetas' })).toBeNull();
  });

  it('shows the given card as a chip on the right side of the judge scoreboard', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    expect(document.querySelector('.half.left .chip')).toBeNull();
    await click('Tarjetas');
    await click('Tarjeta amarilla a Bea');

    expect(document.querySelector('.half.right .chip')?.textContent).toBe('Amarilla ×1');
    expect(document.querySelector('.half.left .chip')).toBeNull();
  });

  it('still shows the cards of a resumed bout', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Tarjetas');
    await click('Tarjeta roja a Ana');
    await waitFor(() => expect(screen.getByText('Todo sincronizado')).toBeTruthy());
    cleanup();

    await open(h);
    expect(document.querySelector('.half.left .chip')?.textContent).toBe('Roja ×1');
  });

  it('links to the public board in the same tab, next to the leave link', async () => {
    const h = harness();
    await open(h);
    const board = screen.getByRole('link', { name: 'Ver el marcador público' });
    expect(board.getAttribute('href')).toBe('#/');
    expect(board.getAttribute('target')).toBeNull();
    expect(screen.getByRole('link', { name: 'Volver a las pistas' }).getAttribute('href')).toBe('#/judge');
  });

  it('keeps scoring offline, shows the pending count and flushes when the connection returns', async () => {
    const h = harness();
    await open(h);
    h.server.down = true;
    await click('Iniciar reloj');
    await click('Tocado para Ana');

    expect(score('left')).toBe('1');
    await waitFor(() => expect(screen.getByText('Sin conexión')).toBeTruthy());
    expect(screen.getByText('2 sin sincronizar')).toBeTruthy();
    expect(h.server.events).toHaveLength(0);

    h.server.down = false;
    h.goOnline();
    await waitFor(() => expect(screen.getByText('Todo sincronizado')).toBeTruthy());
    expect(screen.getByText('En línea')).toBeTruthy();
    expect(h.server.events.map((e) => e.event.type)).toEqual(['clock-started', 'touch-scored']);
  });

  it('asks for the PIN again when the server stops accepting it', async () => {
    const h = harness();
    await open(h);
    h.server.forceStatus = { status: 401 };
    await click('Iniciar reloj');
    expect(await screen.findByText('El servidor no acepta el PIN de esta pista.')).toBeTruthy();
    await click('Introducir PIN de nuevo');
    expect(await screen.findByRole('heading', { name: 'PIN de la pista p1' })).toBeTruthy();
  });

  it('counts the break down and skips it', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(190_000);
    expect(screen.getByText('Descanso')).toBeTruthy();
    expect(screen.getByText('0:50')).toBeTruthy();
    await click('Saltar descanso');
    expect(screen.getByText('Periodo 2 de 3')).toBeTruthy();
  });

  it('lets the judge pick who won the priority draw', async () => {
    const h = harness({ weapon: 'foil', options: { periods: 1 }, left: 'Ana', right: 'Bea' });
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(181_000);
    expect(screen.getByText('Sorteo de prioridad', { selector: '.phase' })).toBeTruthy();
    await click('Gana el sorteo: Bea');
    expect(screen.getByText('Prioridad: Bea')).toBeTruthy();
    expect(screen.getByText('Minuto de prioridad')).toBeTruthy();
  });

  it('shows the winner and reason when the bout finishes, then offers a new bout once synced', async () => {
    const h = harness({ weapon: 'foil', options: { touchLimit: 1 }, left: 'Ana', right: 'Bea' });
    await open(h);
    await click('Iniciar reloj');
    await click('Tocado para Ana');

    expect(screen.getByText('Ganador: Ana')).toBeTruthy();
    expect(screen.getByText('por límite de tocados')).toBeTruthy();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Nuevo combate' }) as HTMLButtonElement).disabled).toBe(false));
    await click('Nuevo combate');
    expect(await screen.findByRole('heading', { name: 'Nuevo combate' })).toBeTruthy();
  });

  it('does not offer a new bout while finished results are still unsynced', async () => {
    const h = harness({ weapon: 'foil', options: { touchLimit: 1 }, left: 'Ana', right: 'Bea' });
    await open(h);
    h.server.down = true;
    await click('Iniciar reloj');
    await click('Tocado para Ana');
    expect(screen.getByText('Ganador: Ana')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Nuevo combate' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Espera a que se sincronicen 2 eventos/)).toBeTruthy();
  });
});

describe('manual correction', () => {
  const type = (label: string | RegExp, value: string) =>
    fireEvent.input(screen.getByLabelText(label), { target: { value } });

  it('is a labelled button apart from the scoring areas that opens and closes the sheet', async () => {
    await open(harness());
    expect(screen.queryByRole('group', { name: 'Corregir el combate' })).toBeNull();
    await click('Corregir marcador y reloj');
    expect(screen.getByRole('group', { name: 'Corregir el combate' })).toBeTruthy();
    await click('Cerrar corrección');
    expect(screen.queryByRole('group', { name: 'Corregir el combate' })).toBeNull();
  });

  it('resets the scores after confirming, and syncs the correction', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Tocado para Ana');
    await click('Tocado para Bea');
    await click('Tocado para Bea');
    await click('Corregir marcador y reloj');
    await click('Marcador a 0-0');
    expect(score('right')).toBe('2');

    await click('Sí, aplicar el cambio');
    expect(score('left')).toBe('0');
    expect(score('right')).toBe('0');
    expect(screen.queryByRole('group', { name: 'Corregir el combate' })).toBeNull();
    await waitFor(() => expect(screen.getByText('Todo sincronizado')).toBeTruthy());
    expect(h.server.events.at(-1)?.event).toMatchObject({ type: 'state-set', score: { left: 0, right: 0 } });
  });

  it('clears the cards from the correction sheet', async () => {
    const h = harness();
    await open(h);
    await click('Corregir marcador y reloj');
    await click('Quitar tarjetas');
    await click('Sí, aplicar el cambio');
    await waitFor(() => expect(h.server.events.at(-1)?.event).toMatchObject({ type: 'state-set', clearCards: true }));
  });

  it('resets the clock and leaves it stopped', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(60_000);
    expect(screen.getByText('2:00')).toBeTruthy();
    await click('Corregir marcador y reloj');
    await click('Reiniciar reloj');
    await click('Sí, aplicar el cambio');
    expect(screen.getByText('3:00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar reloj' })).toBeTruthy();
  });

  it('sets score, time and period at once', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Corregir marcador y reloj');
    await type('Tocados de Ana', '7');
    await type('Tocados de Bea', '4');
    await type('Minutos', '1');
    await type('Segundos', '30');
    await type(/^Periodo/, '2');
    await click('Revisar cambios');
    await click('Sí, aplicar el cambio');

    expect(score('left')).toBe('7');
    expect(score('right')).toBe('4');
    expect(screen.getByText('1:30')).toBeTruthy();
    expect(screen.getByText('Periodo 2 de 3')).toBeTruthy();
  });

  it('reopens a finished bout, saying so before it applies', async () => {
    const h = harness({ weapon: 'foil', options: { touchLimit: 1 }, left: 'Ana', right: 'Bea' });
    await open(h);
    await click('Iniciar reloj');
    await click('Tocado para Ana');
    expect(screen.getByText('Ganador: Ana')).toBeTruthy();

    await click('Corregir marcador y reloj');
    await click('Marcador a 0-0');
    expect(screen.getByText('El combate ya terminó: esto lo reabre.')).toBeTruthy();
    await click('Sí, aplicar el cambio');

    expect(screen.queryByText('Ganador: Ana')).toBeNull();
    expect(score('left')).toBe('0');
    expect((screen.getByRole('button', { name: 'Tocado para Ana' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows a specific error for an invalid time and keeps the state', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await h.elapse(10_000);
    await click('Corregir marcador y reloj');
    await type('Minutos', '99');
    await click('Revisar cambios');
    await click('Sí, aplicar el cambio');

    expect(screen.getByRole('alert').textContent?.trim()).toBe('El tiempo debe estar entre 0:00 y 3:00.');
    expect(screen.getByRole('group', { name: 'Corregir el combate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Parar reloj' })).toBeTruthy();
    expect(h.server.events.map((e) => e.event.type)).not.toContain('state-set');
  });

  it('undo reverts a correction', async () => {
    const h = harness();
    await open(h);
    await click('Iniciar reloj');
    await click('Tocado para Ana');
    await click('Corregir marcador y reloj');
    await click('Marcador a 0-0');
    await click('Sí, aplicar el cambio');
    expect(score('left')).toBe('0');

    await click('Deshacer');
    expect(score('left')).toBe('1');
  });
});

describe('facing the audience (piste flag)', () => {
  const halves = () => Array.from(document.querySelectorAll('.halves .half')).map((el) => el.classList[1]);
  const names = (selector: string) =>
    Array.from(document.querySelectorAll(selector)).map((el) => el.textContent?.trim());
  const toggle = () => screen.getByRole('checkbox', { name: 'Estoy de cara al público' }) as HTMLInputElement;
  const hint = () => screen.queryByText(/No se pudo cambiar/);
  const putCount = (h: ReturnType<typeof harness>) => h.server.requests.filter((r) => r.method === 'PUT').length;

  it('is off by default and keeps the domain order', async () => {
    await open(harness());
    expect(toggle().checked).toBe(false);
    expect(halves()).toEqual(['left', 'right']);
  });

  it('shows the flag stored on the piste', async () => {
    const h = harness();
    h.server.facingAudience = true;
    await open(h);
    await waitFor(() => expect(toggle().checked).toBe(true));
  });

  it('setting it changes the piste flag with the PIN and never mirrors the judge screen', async () => {
    const h = harness();
    await open(h);
    await fireEvent.click(toggle());
    await waitFor(() => expect(h.server.facingAudience).toBe(true));
    expect(h.server.requests.filter((r) => r.method === 'PUT')).toMatchObject([
      { path: '/pistes/p1/facing-audience', headers: { 'x-piste-pin': PIN }, body: { facing: true } },
    ]);
    expect(toggle().checked).toBe(true);
    expect(halves()).toEqual(['left', 'right']);
    expect(names('.halves .name')).toEqual(['Ana', 'Bea']);

    await click('Tarjetas');
    expect(names('.sheet .column:first-child .yellow')).toEqual(['Tarjeta amarilla a Ana']);
  });

  it('keeps sides, colours and events untouched', async () => {
    const h = harness();
    await open(h);
    await fireEvent.click(toggle());
    await waitFor(() => expect(h.server.facingAudience).toBe(true));
    await click('Iniciar reloj');
    await click('Tocado para Bea');
    expect(score('right')).toBe('1');
    await waitFor(() => expect(h.server.events.map((e) => e.event.type)).toEqual(['clock-started', 'touch-scored']));
    expect(h.server.events[1]?.event).toMatchObject({ side: 'right' });
  });

  it('turns it off again', async () => {
    const h = harness();
    h.server.facingAudience = true;
    await open(h);
    await waitFor(() => expect(toggle().checked).toBe(true));
    await fireEvent.click(toggle());
    await waitFor(() => expect(h.server.facingAudience).toBe(false));
    expect(toggle().checked).toBe(false);
  });

  it('offline: keeps the last known value and says the change was not saved', async () => {
    const h = harness();
    await open(h);
    h.server.down = true;
    await fireEvent.click(toggle());
    await waitFor(() => expect(hint()).toBeTruthy());
    expect(toggle().checked).toBe(false);
    expect(toggle().disabled).toBe(false);
    expect(h.server.facingAudience).toBe(false);

    h.server.down = false;
    await fireEvent.click(toggle());
    await waitFor(() => expect(h.server.facingAudience).toBe(true));
    expect(hint()).toBeNull();
    expect(toggle().checked).toBe(true);
    expect(putCount(h)).toBe(2);
  });

  it('survives across bouts and reloads: it is read back from the piste, not from the device', async () => {
    const h = harness();
    await open(h);
    await fireEvent.click(toggle());
    await waitFor(() => expect(h.server.facingAudience).toBe(true));
    cleanup();
    await open(h);
    await waitFor(() => expect(toggle().checked).toBe(true));
  });
});
