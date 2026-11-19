import type { FastifyBaseLogger } from 'fastify';
import { ImportError, importPackZip } from '@mmp/importers';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { releases } from '../db/schema';
import type { BlobStore } from '../storage/blob-store';
import { recordBlob } from './blobs';
import type { SettingsService } from './settings';
import { discardUpload, uploadPath } from './uploads';

const PROGRESS_WRITE_INTERVAL_MS = 500;

export interface ImportJob {
  releaseId: string;
  uploadId: string;
}

/**
 * Imports run one at a time in the background. Their progress lives on the
 * release row, which the panel polls.
 */
export class ImportQueue {
  private readonly queue: ImportJob[] = [];
  private running: Promise<void> | null = null;

  constructor(
    private readonly deps: {
      db: Db;
      blobs: BlobStore;
      settings: SettingsService;
      tmpDir: string;
      fetch: typeof fetch;
      log: FastifyBaseLogger;
    },
  ) {}

  /** Marks imports interrupted by a restart as failed, since their upload state is gone. */
  recoverInterrupted(): void {
    this.deps.db
      .update(releases)
      .set({ status: 'failed', error: 'The server restarted during the import. Upload the pack again.' })
      .where(eq(releases.status, 'importing'))
      .run();
  }

  enqueue(job: ImportJob): void {
    this.queue.push(job);
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
  }

  /** Resolves once the queue is empty. Used by tests and graceful shutdown. */
  async idle(): Promise<void> {
    while (this.running) await this.running;
  }

  private async drain(): Promise<void> {
    for (let job = this.queue.shift(); job; job = this.queue.shift()) {
      await this.run(job);
    }
  }

  private async run({ releaseId, uploadId }: ImportJob): Promise<void> {
    const { db, blobs, settings, tmpDir, log } = this.deps;
    let lastWrite = 0;
    const setProgress = (fraction: number, message: string) => {
      const now = Date.now();
      if (now - lastWrite < PROGRESS_WRITE_INTERVAL_MS) return;
      lastWrite = now;
      db.update(releases)
        .set({ importProgress: Math.min(0.99, fraction), importMessage: message.slice(0, 200) })
        .where(eq(releases.id, releaseId))
        .run();
    };

    try {
      const result = await importPackZip(uploadPath(tmpDir, uploadId), {
        curseforgeApiKey: settings.get('curseforgeApiKey') || undefined,
        fetch: this.deps.fetch,
        onProgress: setProgress,
        putBlob: async (stream) => {
          const stored = await blobs.put(stream);
          recordBlob(db, stored);
          return stored;
        },
      });

      db.update(releases)
        .set({
          status: result.missing.length > 0 ? 'needs_files' : 'ready',
          sourceFormat: result.format,
          manifest: { minecraft: result.minecraft, loader: result.loader, files: result.files },
          missing: result.missing,
          sizeBytes: result.files.reduce((sum, f) => sum + f.size, 0),
          fileCount: result.files.length,
          importProgress: 1,
          importMessage: '',
          error: null,
        })
        .where(eq(releases.id, releaseId))
        .run();
      log.info({ releaseId, files: result.files.length, missing: result.missing.length }, 'import finished');
    } catch (err) {
      const message = err instanceof ImportError ? err.message : 'The import failed unexpectedly. Check the server log.';
      if (!(err instanceof ImportError)) log.error({ err, releaseId }, 'import crashed');
      db.update(releases)
        .set({ status: 'failed', error: message, importMessage: '' })
        .where(eq(releases.id, releaseId))
        .run();
    } finally {
      await discardUpload(db, tmpDir, uploadId);
    }
  }
}
