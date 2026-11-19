import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { MEDIA_KINDS, type Media, type MediaKind, type PublicScreenshot } from '@mmp/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context';
import { media, packs } from '../db/schema';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { parse } from '../lib/validate';
import { canSeePack } from '../services/access';
import { getPlayer, requireAdmin } from '../services/auth';
import { recordBlob } from '../services/blobs';
import { collectGarbage } from '../services/gc';
import { mediaUrl } from '../services/dto';

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/** Only raster formats. SVG is refused because it can carry scripts. */
export function sniffImageType(head: Buffer): string | null {
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.length >= 6 && /^GIF8[79]a$/.test(head.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

async function readLimited(stream: Readable, max: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += (chunk as Buffer).length;
    if (size > max) throw new HttpError(413, 'too_large', `Images may be at most ${max / 1024 / 1024} MB`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

const toMedia = (row: typeof media.$inferSelect): Media => ({
  id: row.id,
  sha256: row.sha256,
  kind: row.kind,
  packId: row.packId ?? null,
  url: mediaUrl(row.sha256)!,
});

export async function mediaRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, blobs, settings } = ctx;

  app.get<{ Params: { sha256: string } }>('/media/:sha256', async (request, reply) => {
    const row = db.select().from(media).where(eq(media.sha256, request.params.sha256)).get();
    if (!row) throw notFound('Image');
    return reply
      .header('content-type', row.contentType)
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .send(blobs.open(row.sha256));
  });

  const screenshotRows = (packId: string | null) =>
    db
      .select()
      .from(media)
      .where(and(eq(media.kind, 'screenshot'), packId ? eq(media.packId, packId) : isNull(media.packId)))
      .orderBy(asc(media.createdAt))
      .all();

  /**
   * Without `pack`: the server-wide set (shown on the website). With `pack`: that pack's own
   * screenshots, falling back to the server-wide set when it has none.
   */
  app.get<{ Querystring: { pack?: string } }>('/api/v1/public/screenshots', async (request): Promise<PublicScreenshot[]> => {
    let rows = screenshotRows(null);
    const slug = request.query.pack;
    if (slug) {
      const pack = db.select().from(packs).where(eq(packs.slug, slug)).get();
      if (!pack || !canSeePack(pack.status, getPlayer(ctx, request))) throw notFound('Pack');
      const own = screenshotRows(pack.id);
      if (own.length > 0) rows = own;
    }
    return rows.map((row) => ({ id: row.id, url: mediaUrl(row.sha256)! }));
  });

  await app.register(async (admin) => {
    admin.addHook('preHandler', requireAdmin(ctx));

    admin.post<{ Querystring: { kind?: string; pack?: string } }>('/api/v1/admin/media', async (request) => {
      const kind = parse(z.enum(MEDIA_KINDS), request.query.kind) as MediaKind;
      const packId = request.query.pack || null;
      if (packId && kind !== 'screenshot') throw badRequest('Only screenshots can belong to a pack');
      if (packId && !db.select({ id: packs.id }).from(packs).where(eq(packs.id, packId)).get()) throw notFound('Pack');
      if (!(request.body instanceof Readable)) throw badRequest('Send the image as the raw request body');
      const buffer = await readLimited(request.body, MAX_IMAGE_BYTES);
      const contentType = sniffImageType(buffer);
      if (!contentType) throw badRequest('Images must be PNG, JPEG, GIF or WebP');

      const stored = await blobs.put(Readable.from(buffer));
      recordBlob(db, stored);
      const row = { id: newId(), sha256: stored.sha256, kind, packId, contentType, createdAt: nowIso() };
      db.insert(media).values(row).run();
      return toMedia(row);
    });

    /** Server-wide screenshots, or one pack's with `?pack=<id>`. */
    admin.get<{ Querystring: { pack?: string } }>('/api/v1/admin/screenshots', async (request): Promise<Media[]> =>
      screenshotRows(request.query.pack || null).map(toMedia),
    );

    admin.delete<{ Params: { id: string } }>('/api/v1/admin/screenshots/:id', async (request) => {
      const result = db
        .delete(media)
        .where(and(eq(media.id, request.params.id), eq(media.kind, 'screenshot')))
        .run();
      if (result.changes === 0) throw notFound('Screenshot');
      await collectGarbage(db, blobs, settings);
      return { ok: true };
    });
  });
}
