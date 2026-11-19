import type { Readable } from 'node:stream';
import type { Loader, ManifestFile, MissingFile } from '@mmp/schema';

export interface StoredBlob {
  sha256: string;
  sha1: string;
  size: number;
}

export interface ImportContext {
  /** Stores a file on the creator's server and returns its hashes. */
  putBlob(stream: Readable): Promise<StoredBlob>;
  curseforgeApiKey?: string;
  fetch?: typeof fetch;
  onProgress?(fraction: number, message: string): void;
}

export interface ImportResult {
  format: 'curseforge' | 'modrinth';
  minecraft: string;
  loader: Loader;
  files: ManifestFile[];
  /** Files the creator must upload by hand before the release can be published. */
  missing: MissingFile[];
}

export class ImportError extends Error {
  override name = 'ImportError';
}
