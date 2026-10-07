import type { AppServices } from '../env';
import type { LocalBout } from '../core/local-bout';
import { SyncQueue } from '../core/sync-queue';
import { WakeLockController } from '../core/wake-lock';
import { ScoreboardController } from './scoreboard-controller';

export interface JudgeSessionOptions {
  readonly services: AppServices;
  readonly pisteId: string;
  readonly pin: string;
  readonly bout: LocalBout;
  /** The server could not be reached while opening the piste: show offline until it answers. */
  readonly startedOffline?: boolean;
}

export interface JudgeSession {
  readonly controller: ScoreboardController;
  readonly queue: SyncQueue;
  readonly wakeLock: WakeLockController;
  /** Stops the tick, the retry timer and every listener. The local log is kept. */
  dispose(): void;
}

/**
 * Wires one open bout: the scoreboard controller, the sync queue and the wake lock.
 *
 * - Every stored event kicks the queue (done by the controller).
 * - The browser `online` event retries immediately instead of waiting for the backoff.
 * - Events the device already holds are sent as soon as the session opens. There is no
 *   resync on open: the entry flow has just read the server state, and a resync would throw
 *   away unsent events (the exception is `startedOffline` with nothing to send).
 */
export function createJudgeSession({ services, pisteId, pin, bout, startedOffline = false }: JudgeSessionOptions): JudgeSession {
  const { env, api, clockOffset } = services;
  const queue = new SyncQueue({
    pisteId,
    pin,
    source: bout,
    api,
    timers: env.timers,
    random: env.random,
    now: env.now,
  });
  const controller = new ScoreboardController({
    bout,
    now: () => clockOffset.correctedNow(env.now()),
    newId: env.newId,
    sync: queue,
  });
  const wakeLock = new WakeLockController(env.wakeLock, env.visibility);

  let wanted = false;
  const unsubscribeView = controller.subscribe((model) => {
    if (model.active === wanted) return;
    wanted = model.active;
    void wakeLock.setWanted(wanted);
  });
  const unsubscribeOnline = env.onOnline(() => void queue.retryNow());
  const stopTicking = controller.startTicking(env.timers);

  // Sending never discards anything. A resync would drop unsent events, so it is only used
  // to find out whether the server is reachable when there is nothing to send.
  if (bout.pending().length > 0) queue.kick();
  else if (startedOffline) void queue.resync();

  return {
    controller,
    queue,
    wakeLock,
    dispose() {
      stopTicking();
      unsubscribeView();
      unsubscribeOnline();
      queue.dispose();
      wakeLock.dispose();
    },
  };
}
