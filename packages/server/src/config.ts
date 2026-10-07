export interface Config {
  readonly adminPin: string;
  readonly port: number;
  readonly dbPath: string;
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_DB_PATH = 'la-sala.sqlite';
export const MIN_ADMIN_PIN_LENGTH = 12;

/** Reads and validates the environment. Error messages never contain the admin PIN. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): Config {
  const adminPin = env.ADMIN_PIN?.trim();
  if (!adminPin) {
    throw new Error('ADMIN_PIN is required: set the organizer PIN in the environment before starting the server');
  }
  if (adminPin.length < MIN_ADMIN_PIN_LENGTH) {
    throw new Error(
      `ADMIN_PIN must be at least ${MIN_ADMIN_PIN_LENGTH} characters: the admin PIN is never locked out, so it must resist guessing`,
    );
  }
  return {
    adminPin,
    port: parsePort(env.PORT),
    dbPath: env.DB_PATH?.trim() || DEFAULT_DB_PATH,
  };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}
