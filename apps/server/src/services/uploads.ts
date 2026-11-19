import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq, lt } from 'drizzle-orm';
import type { Db } from '../db';
import { uploads } from '../db/schema';
import { badRequest, notFound } from '../lib/errors';

export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export const uploadPath = (tmpDir: string, id: string) => join(tmpDir, 'uploads', `${id}.part`);

/** A finished upload that belongs to this admin. Throws if it's missing or incomplete. */
export function getCompletedUpload(db: Db, id: string, userId: string) {
  const upload = db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, id), eq(uploads.userId, userId)))
    .get();
  if (!upload) throw notFound('Upload');
  if (upload.received !== upload.size) throw badRequest('The upload has not finished');
  return upload;
}

export async function discardUpload(db: Db, tmpDir: string, id: string): Promise<void> {
  db.delete(uploads).where(eq(uploads.id, id)).run();
  await rm(uploadPath(tmpDir, id), { force: true });
}

export async function pruneStaleUploads(db: Db, tmpDir: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const stale = db.select({ id: uploads.id }).from(uploads).where(lt(uploads.createdAt, cutoff)).all();
  for (const { id } of stale) await discardUpload(db, tmpDir, id);
}
