import type { Config } from './config';
import type { Db } from './db';
import type { MojangClient } from './lib/mojang';
import type { ImportQueue } from './services/imports';
import type { SettingsService } from './services/settings';
import type { BlobStore } from './storage/blob-store';

export interface AppContext {
  config: Config;
  db: Db;
  blobs: BlobStore;
  settings: SettingsService;
  mojang: MojangClient;
  imports: ImportQueue;
  /** Scratch space for in-progress uploads and blob writes. Same filesystem as the blob store. */
  tmpDir: string;
  fetch: typeof fetch;
}
