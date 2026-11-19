import { and, inArray, lt, notInArray } from 'drizzle-orm';
import type { Db } from '../db';
import { blobs, media, packs, releases } from '../db/schema';
import type { BlobStore } from '../storage/blob-store';
import type { SettingsService } from './settings';

/** Images uploaded but never saved onto a pack get this long before they're cleaned up. */
const UNSAVED_MEDIA_GRACE_MS = 6 * 60 * 60 * 1000;
const SINGLE_USE_IMAGE_KINDS = ['thumbnail', 'banner', 'background', 'logo'] as const;

/** Deletes pack and launcher images nothing points to, then any blob that no media row or release uses. */
export async function collectGarbage(db: Db, store: BlobStore, settings: SettingsService): Promise<number> {
  const usedImages = new Set<string>();
  for (const pack of db.select().from(packs).all()) {
    for (const sha of [pack.thumbnail, pack.banner, pack.background]) if (sha) usedImages.add(sha);
  }
  for (const sha of [settings.get('launcherLogo'), settings.get('launcherBackground')]) if (sha) usedImages.add(sha);
  const cutoff = new Date(Date.now() - UNSAVED_MEDIA_GRACE_MS).toISOString();
  db.delete(media)
    .where(
      and(
        inArray(media.kind, [...SINGLE_USE_IMAGE_KINDS]),
        lt(media.createdAt, cutoff),
        usedImages.size > 0 ? notInArray(media.sha256, [...usedImages]) : undefined,
      ),
    )
    .run();

  const referenced = new Set<string>(db.select({ sha256: media.sha256 }).from(media).all().map((m) => m.sha256));
  for (const release of db.select({ manifest: releases.manifest }).from(releases).all()) {
    for (const file of release.manifest?.files ?? []) {
      if (file.source.type === 'blob' && file.hashes.sha256) referenced.add(file.hashes.sha256);
    }
  }

  // Imports write blobs before the release row references them, so young blobs are left alone.
  const orphans = db
    .select({ sha256: blobs.sha256 })
    .from(blobs)
    .where(lt(blobs.createdAt, cutoff))
    .all()
    .filter((b) => !referenced.has(b.sha256));
  for (const { sha256 } of orphans) {
    db.delete(blobs).where(inArray(blobs.sha256, [sha256])).run();
    await store.delete(sha256);
  }
  return orphans.length;
}
