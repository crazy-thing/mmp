import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

/** `src/db/` in development, `dist/` when bundled. */
export const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ??
  [resolve(import.meta.dirname, '../../drizzle'), resolve(import.meta.dirname, '../drizzle')].find((dir) =>
    existsSync(dir),
  ) ??
  resolve('drizzle');

export function openDatabase(file: string, migrationsDir = MIGRATIONS_DIR): { db: Db; close: () => void } {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return { db, close: () => sqlite.close() };
}

export { schema };
