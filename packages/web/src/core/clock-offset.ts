/** One request/response pair observed by the client. All values are epoch milliseconds. */
export interface OffsetObservation {
  /** Client clock when the request was sent. */
  readonly requestStart: number;
  /** Client clock when the response arrived. */
  readonly requestEnd: number;
  /** `serverTime` carried by the response (read by the server while handling the request). */
  readonly serverTime: number;
}

interface Sample {
  readonly offsetMs: number;
  readonly roundTripMs: number;
}

/**
 * Estimates `serverTime - clientTime` (NTP-style, single sample selection).
 *
 * For a request that took `rtt = requestEnd - requestStart`, the server read its clock at
 * some unknown instant inside that window. Assuming it was the midpoint:
 *
 *   offset = serverTime - (requestStart + requestEnd) / 2
 *
 * The true offset lies within `offset +/- rtt / 2`, because the server stamp can fall
 * anywhere in the window. The error bound is therefore half the round trip, which is why we
 * keep the sample with the SMALLEST round trip: it has the tightest bound. A later sample
 * with an equal round trip replaces the older one (fresher, same accuracy).
 *
 * Limits: the bound assumes the phone and server clocks tick at the same rate. Over a bout
 * (minutes) drift is negligible; a long-lived session should keep feeding observations.
 */
export class ClockOffset {
  private best: Sample | null = null;

  /** Records an observation. Impossible samples (NaN, negative round trip) are ignored. */
  observe({ requestStart, requestEnd, serverTime }: OffsetObservation): void {
    if (![requestStart, requestEnd, serverTime].every(Number.isFinite)) return;
    const roundTripMs = requestEnd - requestStart;
    if (roundTripMs < 0) return;
    if (this.best !== null && roundTripMs > this.best.roundTripMs) return;
    this.best = { offsetMs: serverTime - (requestStart + requestEnd) / 2, roundTripMs };
  }

  /** Milliseconds to add to the client clock to get server time. 0 until a sample exists. */
  get offsetMs(): number {
    return this.best?.offsetMs ?? 0;
  }

  /** Maximum error of `offsetMs` (half the best round trip), or null without a sample. */
  get errorBoundMs(): number | null {
    return this.best === null ? null : this.best.roundTripMs / 2;
  }

  /** Converts a client clock reading to estimated server time. */
  correctedNow(clientNow: number): number {
    return clientNow + this.offsetMs;
  }
}
