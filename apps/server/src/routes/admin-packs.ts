import type { FastifyInstance } from 'fastify';
import {
  CHANNELS,
  channelBodySchema,
  packBodySchema,
  releaseCreateBodySchema,
  releaseReimportBodySchema,
  releaseUpdateBodySchema,
  resolveMissingBodySchema,
  type AdminPack,
  type AdminRelease,
  type ChannelName,
  type PackBody,
} from '@mmp/schema';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context';
import { channels, media, packs, releases, uploads } from '../db/schema';
import { badRequest, conflict, notFound } from '../lib/errors';
import { newId, nowIso, slugify } from '../lib/ids';
import { sanitizeChangelog } from '../lib/sanitize';
import { parse } from '../lib/validate';
import { requireAdmin } from '../services/auth';
import { recordBlob } from '../services/blobs';
import { toAdminPack, toAdminRelease } from '../services/dto';
import { collectGarbage } from '../services/gc';
import { discardUpload, getCompletedUpload, uploadPath } from '../services/uploads';

export async function adminPackRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, blobs, settings } = ctx;
  app.addHook('preHandler', requireAdmin(ctx));

  // ---------- helpers ----------

  const getPack = (id: string) => {
    const pack = db.select().from(packs).where(eq(packs.id, id)).get();
    if (!pack) throw notFound('Pack');
    return pack;
  };

  const getRelease = (id: string) => {
    const release = db.select().from(releases).where(eq(releases.id, id)).get();
    if (!release) throw notFound('Release');
    return release;
  };

  const packDto = (id: string): AdminPack =>
    toAdminPack(getPack(id), db.select().from(channels).where(eq(channels.packId, id)).all());

  const releaseDto = (id: string): AdminRelease => {
    const release = getRelease(id);
    return toAdminRelease(release, db.select().from(channels).where(eq(channels.packId, release.packId)).all());
  };

  const assertImagesExist = (body: PackBody) => {
    const shas = [body.thumbnail, body.banner, body.background].filter((s): s is string => Boolean(s));
    if (shas.length === 0) return;
    const found = new Set(
      db.select({ sha256: media.sha256 }).from(media).where(inArray(media.sha256, shas)).all().map((m) => m.sha256),
    );
    if (shas.some((s) => !found.has(s))) throw badRequest('Upload the image before saving the pack');
  };

  const uniqueSlug = (name: string) => {
    const base = slugify(name);
    for (let n = 1; ; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      if (!db.select({ id: packs.id }).from(packs).where(eq(packs.slug, slug)).get()) return slug;
    }
  };

  // ---------- packs ----------

  app.get('/admin/packs', async (): Promise<AdminPack[]> => {
    const channelRows = db.select().from(channels).all();
    return db
      .select()
      .from(packs)
      .orderBy(asc(packs.sortOrder), asc(packs.createdAt))
      .all()
      .map((p) => toAdminPack(p, channelRows));
  });

  app.post('/admin/packs', async (request) => {
    const body = parse(packBodySchema, request.body);
    assertImagesExist(body);
    const now = nowIso();
    const id = newId();
    db.transaction((tx) => {
      tx.insert(packs)
        .values({
          id,
          slug: uniqueSlug(body.name),
          name: body.name,
          status: body.status,
          thumbnail: body.thumbnail,
          banner: body.banner,
          background: body.background,
          sortOrder: body.sortOrder ?? 0,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      for (const name of CHANNELS) tx.insert(channels).values({ packId: id, name, releaseId: null, updatedAt: now }).run();
    });
    return packDto(id);
  });

  app.get<{ Params: { id: string } }>('/admin/packs/:id', async (request) => packDto(request.params.id));

  app.put<{ Params: { id: string } }>('/admin/packs/:id', async (request) => {
    const pack = getPack(request.params.id);
    const body = parse(packBodySchema, request.body);
    assertImagesExist(body);
    db.update(packs)
      .set({
        name: body.name,
        status: body.status,
        thumbnail: body.thumbnail,
        banner: body.banner,
        background: body.background,
        sortOrder: body.sortOrder ?? pack.sortOrder,
        updatedAt: nowIso(),
      })
      .where(eq(packs.id, pack.id))
      .run();
    return packDto(pack.id);
  });

  app.delete<{ Params: { id: string } }>('/admin/packs/:id', async (request) => {
    const pack = getPack(request.params.id);
    if (db.select({ id: releases.id }).from(releases).where(and(eq(releases.packId, pack.id), eq(releases.status, 'importing'))).get()) {
      throw conflict('Wait for the running import to finish before deleting this pack');
    }
    db.delete(packs).where(eq(packs.id, pack.id)).run();
    await collectGarbage(db, blobs, settings);
    return { ok: true };
  });

  // ---------- channels ----------

  app.put<{ Params: { id: string; channel: string } }>('/admin/packs/:id/channels/:channel', async (request) => {
    const pack = getPack(request.params.id);
    const channel = parse(z.enum(CHANNELS), request.params.channel) as ChannelName;
    const { releaseId } = parse(channelBodySchema, request.body);
    if (releaseId) {
      const release = getRelease(releaseId);
      if (release.packId !== pack.id) throw badRequest('That release belongs to another pack');
      if (release.status !== 'ready') throw conflict('Only fully imported releases can be published');
    }
    db.update(channels)
      .set({ releaseId, updatedAt: nowIso() })
      .where(and(eq(channels.packId, pack.id), eq(channels.name, channel)))
      .run();
    return packDto(pack.id);
  });

  // ---------- releases ----------

  app.get<{ Params: { id: string } }>('/admin/packs/:id/releases', async (request): Promise<AdminRelease[]> => {
    const pack = getPack(request.params.id);
    const channelRows = db.select().from(channels).where(eq(channels.packId, pack.id)).all();
    return db
      .select()
      .from(releases)
      .where(eq(releases.packId, pack.id))
      .orderBy(desc(releases.createdAt))
      .all()
      .map((r) => toAdminRelease(r, channelRows));
  });

  app.post<{ Params: { id: string } }>('/admin/packs/:id/releases', async (request) => {
    const pack = getPack(request.params.id);
    const body = parse(releaseCreateBodySchema, request.body);
    const upload = getCompletedUpload(db, body.uploadId, request.admin!.id);
    const id = newId();
    db.insert(releases)
      .values({
        id,
        packId: pack.id,
        name: body.name,
        displayDate: body.displayDate,
        changelogHtml: sanitizeChangelog(body.changelogHtml),
        changelogVisible: body.changelogVisible,
        cleanInstall: body.cleanInstall,
        status: 'importing',
        sourceFilename: upload.filename,
        createdBy: request.admin!.id,
        createdAt: nowIso(),
      })
      .run();
    // Detach the upload from its owner so it can't be reused while the import runs.
    db.update(uploads).set({ received: -1 }).where(eq(uploads.id, upload.id)).run();
    ctx.imports.enqueue({ releaseId: id, uploadId: upload.id });
    return releaseDto(id);
  });

  app.get<{ Params: { id: string } }>('/admin/releases/:id', async (request) => releaseDto(request.params.id));

  app.patch<{ Params: { id: string } }>('/admin/releases/:id', async (request) => {
    const release = getRelease(request.params.id);
    const body = parse(releaseUpdateBodySchema, request.body);
    db.update(releases)
      .set({
        ...body,
        changelogHtml: body.changelogHtml === undefined ? undefined : sanitizeChangelog(body.changelogHtml),
      })
      .where(eq(releases.id, release.id))
      .run();
    return releaseDto(release.id);
  });

  app.delete<{ Params: { id: string } }>('/admin/releases/:id', async (request) => {
    const release = getRelease(request.params.id);
    if (release.status === 'importing') throw conflict('Wait for the import to finish before deleting');
    db.delete(releases).where(eq(releases.id, release.id)).run();
    await collectGarbage(db, blobs, settings);
    return { ok: true };
  });

  /** Replaces a release's files. Only allowed before it has been published to a channel. */
  app.post<{ Params: { id: string } }>('/admin/releases/:id/reimport', async (request) => {
    const release = getRelease(request.params.id);
    const { uploadId } = parse(releaseReimportBodySchema, request.body);
    if (release.status === 'importing') throw conflict('An import is already running');
    if (db.select().from(channels).where(eq(channels.releaseId, release.id)).get()) {
      throw conflict('This release is live on a channel. Publish a new version instead of replacing its files.');
    }
    const upload = getCompletedUpload(db, uploadId, request.admin!.id);
    db.update(releases)
      .set({
        status: 'importing',
        sourceFilename: upload.filename,
        sourceFormat: null,
        manifest: null,
        missing: [],
        sizeBytes: 0,
        fileCount: 0,
        importProgress: 0,
        importMessage: '',
        error: null,
      })
      .where(eq(releases.id, release.id))
      .run();
    db.update(uploads).set({ received: -1 }).where(eq(uploads.id, upload.id)).run();
    ctx.imports.enqueue({ releaseId: release.id, uploadId: upload.id });
    return releaseDto(release.id);
  });

  /** Supplies a file CurseForge won't let us download, e.g. a mod whose author opted out. */
  app.post<{ Params: { id: string } }>('/admin/releases/:id/missing', async (request) => {
    const release = getRelease(request.params.id);
    const body = parse(resolveMissingBodySchema, request.body);
    const missing = release.missing.find((m) => m.path === body.path);
    if (!missing || !release.manifest) throw notFound('Missing file');
    const upload = getCompletedUpload(db, body.uploadId, request.admin!.id);

    const stored = await blobs.putFile(uploadPath(ctx.tmpDir, upload.id));
    await discardUpload(db, ctx.tmpDir, upload.id);
    if (missing.sha1 && stored.sha1 !== missing.sha1) {
      recordBlob(db, stored);
      throw badRequest(`That isn't ${missing.fileName}. The file's hash doesn't match what the pack expects.`);
    }
    recordBlob(db, stored);

    const remaining = release.missing.filter((m) => m.path !== body.path);
    const files = [
      ...release.manifest.files.filter((f) => f.path !== missing.path),
      {
        path: missing.path,
        size: stored.size,
        hashes: { sha1: stored.sha1, sha256: stored.sha256 },
        source: { type: 'blob' as const },
        policy: 'overwrite' as const,
      },
    ];
    db.update(releases)
      .set({
        manifest: { ...release.manifest, files },
        missing: remaining,
        status: remaining.length === 0 ? 'ready' : 'needs_files',
        sizeBytes: files.reduce((sum, f) => sum + f.size, 0),
        fileCount: files.length,
      })
      .where(eq(releases.id, release.id))
      .run();
    return releaseDto(release.id);
  });
}
