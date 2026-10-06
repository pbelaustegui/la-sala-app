import type { PinGenerator, Piste, PisteRepository } from './ports';

/** Upper bound on pistes per call; also keeps unique 4-digit PIN generation well within 10 000. */
export const MAX_PISTES = 100;

const MAX_PIN_ATTEMPTS = 1000;

export interface CreatePistesDeps {
  readonly repository: PisteRepository;
  readonly pinGenerator: PinGenerator;
}

/** Replaces all pistes with `count` new ones, each with a unique PIN. */
export async function createPistes(deps: CreatePistesDeps, count: number): Promise<readonly Piste[]> {
  const used = new Set<string>();
  const pistes: Piste[] = [];
  for (let index = 1; index <= count; index++) {
    pistes.push({ id: String(index), pin: uniquePin(deps.pinGenerator, used) });
  }
  await deps.repository.replacePistes(pistes);
  return pistes;
}

function uniquePin(generator: PinGenerator, used: Set<string>): string {
  for (let attempt = 0; attempt < MAX_PIN_ATTEMPTS; attempt++) {
    const pin = generator.generate();
    if (!used.has(pin)) {
      used.add(pin);
      return pin;
    }
  }
  throw new Error('Could not generate a unique PIN');
}
