import { mkdir, open, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { uploadCreateBodySchema, type UploadSession } from '@mmp/schema';
import { and, eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { uploads } from '../db/schema';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { parse } from '../lib/validate';
import { requireAdmin } from '../services/auth';
import { UPLOAD_CHUNK_SIZE, uploadPath } from '../services/uploads';

/**
 * Resumable uploads: create a session, then PUT raw chunks with an `Upload-Offset`
 * header. GET the session to find where to resume after a dropped connection.
 */
export async function adminUploadRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, tmpDir } = ctx;
  const inFlight = new Set<string>();

  const getOwn = (id: string, userId: string) => {
    const row = db
      .select()
      .from(uploads)
      .where(and(eq(uploads.id, id), eq(uploads.userId, userId)))
      .get();
    if (!row) throw notFound('Upload');
    return row;
  };

  const toDto = (row: typeof uploads.$inferSelect): UploadSession => ({
    id: row.id,
    received: row.received,
    size: row.size,
    chunkSize: UPLOAD_CHUNK_SIZE,
  });

  app.addHook('preHandler', requireAdmin(ctx));

  app.post('/admin/uploads', async (request) => {
    const body = parse(uploadCreateBodySchema, request.body);
    const row = {
      id: newId(),
      filename: body.filename,
      size: body.size,
      received: 0,
      userId: request.admin!.id,
      createdAt: nowIso(),
    };
    const path = uploadPath(tmpDir, row.id);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '');
    db.insert(uploads).values(row).run();
    return toDto(row);
  });

  app.get<{ Params: { id: string } }>('/admin/uploads/:id', async (request) =>
    toDto(getOwn(request.params.id, request.admin!.id)),
  );

  app.put<{ Params: { id: string } }>('/admin/uploads/:id', async (request) => {
    const row = getOwn(request.params.id, request.admin!.id);
    const offset = Number(request.headers['upload-offset']);
    if (!Number.isInteger(offset)) throw badRequest('Upload-Offset header is required');
    if (offset !== row.received) throw conflict(`Expected offset ${row.received}`);
    if (!(request.body && typeof (request.body as Readable).pipe === 'function')) {
      throw badRequest('Send the chunk as application/octet-stream');
    }
    if (inFlight.has(row.id)) throw conflict('A chunk for this upload is already being written');

    const limit = Math.min(UPLOAD_CHUNK_SIZE, row.size - row.received);
    let written = 0;
    let tooLarge = false;

    inFlight.add(row.id);
    const file = await open(uploadPath(tmpDir, row.id), 'r+');
    try {
      // Read the whole body even when it's too large, so the client gets a 413 instead of a reset connection.
      for await (const chunk of request.body as Readable) {
        const buf = chunk as Buffer;
        if (tooLarge || written + buf.length > limit) {
          tooLarge = true;
          continue;
        }
        await file.write(buf, 0, buf.length, offset + written);
        written += buf.length;
      }
    } finally {
      await file.close();
      inFlight.delete(row.id);
    }
    if (tooLarge) throw new HttpError(413, 'too_large', `Chunks may be at most ${limit} bytes here`);

    const received = offset + written;
    db.update(uploads).set({ received }).where(eq(uploads.id, row.id)).run();
    return toDto({ ...row, received });
  });
}
