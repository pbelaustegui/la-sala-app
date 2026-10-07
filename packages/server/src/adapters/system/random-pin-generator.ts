import { randomInt } from 'node:crypto';
import type { PinGenerator } from '../../application/ports';

/** Cryptographically random 4-digit PINs ("0000"-"9999"). */
export class RandomPinGenerator implements PinGenerator {
  constructor(private readonly random: () => number = () => randomInt(0, 10_000)) {}

  generate(): string {
    return String(this.random()).padStart(4, '0');
  }
}
