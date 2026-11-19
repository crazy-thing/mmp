import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { StoredBlob } from '@mmp/importers';
import { newId } from '../lib/ids';

/**
 * Content-addressed file storage. Files are keyed by sha256, so storing the same
 * file twice is free and nothing is ever addressed by a user-supplied name.
 */
export interface BlobStore {
  put(stream: Readable): Promise<StoredBlob>;
  /** Moves an already-written local file into the store. */
  putFile(path: string): Promise<StoredBlob>;
  open(sha256: string): Readable;
  exists(sha256: string): Promise<boolean>;
  delete(sha256: string): Promise<void>;
}

const SHA256 = /^[0-9a-f]{64}$/;

export function createLocalBlobStore(root: string, tmpDir: string): BlobStore {
  const pathFor = (sha256: string) => {
    if (!SHA256.test(sha256)) throw new Error('Invalid blob key');
    return join(root, sha256.slice(0, 2), sha256);
  };

  async function commit(tmpPath: string, hashes: StoredBlob): Promise<StoredBlob> {
    const target = pathFor(hashes.sha256);
    await mkdir(join(root, hashes.sha256.slice(0, 2)), { recursive: true });
    await rename(tmpPath, target);
    return hashes;
  }

  async function hashInto(stream: Readable, tmpPath: string): Promise<StoredBlob> {
    const sha256 = createHash('sha256');
    const sha1 = createHash('sha1');
    let size = 0;
    const hasher = new Transform({
      transform(chunk: Buffer, _enc, done) {
        sha256.update(chunk);
        sha1.update(chunk);
        size += chunk.length;
        done(null, chunk);
      },
    });
    await pipeline(stream, hasher, createWriteStream(tmpPath));
    return { sha256: sha256.digest('hex'), sha1: sha1.digest('hex'), size };
  }

  return {
    async put(stream) {
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `blob-${newId()}`);
      try {
        return await commit(tmpPath, await hashInto(stream, tmpPath));
      } catch (err) {
        await rm(tmpPath, { force: true });
        throw err;
      }
    },

    async putFile(path) {
      const sha256 = createHash('sha256');
      const sha1 = createHash('sha1');
      let size = 0;
      for await (const chunk of createReadStream(path)) {
        sha256.update(chunk as Buffer);
        sha1.update(chunk as Buffer);
        size += (chunk as Buffer).length;
      }
      return commit(path, { sha256: sha256.digest('hex'), sha1: sha1.digest('hex'), size });
    },

    open(sha256) {
      return createReadStream(pathFor(sha256));
    },

    async exists(sha256) {
      try {
        await stat(pathFor(sha256));
        return true;
      } catch {
        return false;
      }
    },

    async delete(sha256) {
      await rm(pathFor(sha256), { force: true });
    },
  };
}
