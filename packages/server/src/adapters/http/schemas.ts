import type { BoutEvent } from '@la-sala/domain';
import { z } from 'zod';
import { MAX_PISTES } from '../../application/create-pistes';
import type { BoutSetup, StoredEvent } from '../../application/ports';

export const createPistesBody = z.object({ count: z.number().int().min(1).max(MAX_PISTES) });

const positiveInt = z.number().int().positive();

export const startBoutBody = z.object({
  weapon: z.enum(['foil', 'epee', 'sabre']),
  options: z
    .object({
      periods: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      touchLimit: positiveInt.optional(),
      periodDurationMs: positiveInt.optional(),
      breakDurationMs: positiveInt.optional(),
    })
    .optional(),
  left: z.string().trim().min(1).max(100),
  right: z.string().trim().min(1).max(100),
});

const side = z.enum(['left', 'right']);
const count = z.number().int().nonnegative();
const common = { id: z.string().min(1).max(100), at: z.number().finite() };

const eventSchema = z.discriminatedUnion('type', [
  z.object({ ...common, type: z.literal('clock-started') }),
  z.object({ ...common, type: z.literal('clock-stopped') }),
  z.object({ ...common, type: z.literal('break-skipped') }),
  z.object({ ...common, type: z.literal('touch-scored'), side }),
  z.object({ ...common, type: z.literal('double-touch-scored') }),
  z.object({ ...common, type: z.literal('priority-drawn'), side }),
  z.object({ ...common, type: z.literal('card-given'), side, card: z.enum(['yellow', 'red', 'black']) }),
  z.object({ ...common, type: z.literal('undo') }),
  // Ranges that depend on the rules (period count, period duration) and the empty patch are
  // left to the domain, which answers 422.
  z.object({
    ...common,
    type: z.literal('state-set'),
    score: z.object({ left: count, right: count }).optional(),
    remainingMs: count.optional(),
    period: positiveInt.optional(),
  }),
]);

export const MAX_EVENTS_PER_BATCH = 500;

export const submitEventsBody = z.object({
  events: z.array(eventSchema).max(MAX_EVENTS_PER_BATCH),
});

export function toSetup(body: z.infer<typeof startBoutBody>): BoutSetup {
  return { weapon: body.weapon, options: body.options, left: body.left, right: body.right };
}

export function toStoredEvents(body: z.infer<typeof submitEventsBody>): StoredEvent[] {
  return body.events.map(({ id, ...event }) => ({ id, event: event as BoutEvent }));
}
