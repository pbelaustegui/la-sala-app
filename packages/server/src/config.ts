import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Config {
  readonly adminPin: string;
  readonly port: number;
  readonly dbPath: string;
  /** Absolute path of the built web app (`WEB_DIST`), or undefined to serve only the API. */
  readonly webDist?: string;
}

export const DEFAULT_PORT = 3000;
export const DEFAULT_DB_PATH = 'la-sala.sqlite';
export const MIN_ADMIN_PIN_LENGTH = 12;

/** Reads and validates the environment. Error messages never contain the admin PIN. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>, cwd: string = process.cwd()): Config {
  const adminPin = env.ADMIN_PIN?.trim();
  if (!adminPin) {
    throw new Error('ADMIN_PIN is required: set the organizer PIN in the environment before starting the server');
  }
  if (adminPin.length < MIN_ADMIN_PIN_LENGTH) {
    throw new Error(
      `ADMIN_PIN must be at least ${MIN_ADMIN_PIN_LENGTH} characters: the admin PIN is never locked out, so it must resist guessing`,
    );
  }
  const webDist = parseWebDist(env.WEB_DIST, cwd);
  return {
    adminPin,
    port: parsePort(env.PORT),
    dbPath: env.DB_PATH?.trim() || DEFAULT_DB_PATH,
    ...(webDist ? { webDist } : {}),
  };
}

/** Resolves `WEB_DIST` against the working directory and checks that it holds a built app. */
function parseWebDist(raw: string | undefined, cwd: string): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const dist = resolve(cwd, value);
  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    throw new Error(
      `WEB_DIST "${value}" does not exist (looked for ${dist}): build the web app first with "npm run build -w packages/web"`,
    );
  }
  if (!existsSync(join(dist, 'index.html'))) {
    throw new Error(
      `WEB_DIST "${value}" has no index.html (looked in ${dist}): build the web app first with "npm run build -w packages/web"`,
    );
  }
  return dist;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}
