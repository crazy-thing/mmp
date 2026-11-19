import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { count } from 'drizzle-orm';
import type { Db } from '../db';
import { adminUsers } from '../db/schema';
import type { SettingsService } from './settings';

/** No 0/O, 1/I/L, so the code survives being read off a log and typed in. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;

export const SETUP_CODE_FILE = 'setup-code.txt';

export const needsSetup = (db: Db) => (db.select({ n: count() }).from(adminUsers).get()?.n ?? 0) === 0;

const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const digest = (code: string) => createHash('sha256').update(normalize(code)).digest();

/** The current setup code, created on first use. Something like `K7PQ-WX3M-9RTD` (about 60 bits). */
export function currentSetupCode(settings: SettingsService): string {
  const existing = settings.get('setupCode');
  if (existing) return existing;
  const groups = Array.from({ length: GROUPS }, () =>
    Array.from({ length: GROUP_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''),
  );
  const code = groups.join('-');
  settings.set('setupCode', code);
  return code;
}

export function setupCodeMatches(settings: SettingsService, attempt: string): boolean {
  const expected = settings.get('setupCode');
  if (!expected) return false;
  return timingSafeEqual(digest(expected), digest(attempt));
}

/** Writes the code next to the database so it can be read off the disk as well as the log. */
export async function publishSetupCode(settings: SettingsService, dataDir: string): Promise<string> {
  const code = currentSetupCode(settings);
  await writeFile(join(dataDir, SETUP_CODE_FILE), `${code}\n`, { mode: 0o600 });
  return code;
}

export async function clearSetupCode(settings: SettingsService, dataDir: string): Promise<void> {
  settings.set('setupCode', '');
  await rm(join(dataDir, SETUP_CODE_FILE), { force: true });
}
