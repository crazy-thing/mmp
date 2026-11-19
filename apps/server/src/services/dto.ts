import type { AdminPack, AdminRelease, ChannelName, PublicReleaseSummary } from '@mmp/schema';
import { CHANNELS } from '@mmp/schema';
import type { channels, packs, releases } from '../db/schema';

type PackRow = typeof packs.$inferSelect;
type ReleaseRow = typeof releases.$inferSelect;
type ChannelRow = typeof channels.$inferSelect;

export const mediaUrl = (sha256: string | null) => (sha256 ? `/media/${sha256}` : null);

export function channelMap(rows: ChannelRow[]): Record<ChannelName, string | null> {
  const map = Object.fromEntries(CHANNELS.map((c) => [c, null])) as Record<ChannelName, string | null>;
  for (const row of rows) map[row.name] = row.releaseId;
  return map;
}

export function toAdminPack(pack: PackRow, channelRows: ChannelRow[]): AdminPack {
  return {
    id: pack.id,
    slug: pack.slug,
    name: pack.name,
    status: pack.status,
    thumbnail: pack.thumbnail,
    banner: pack.banner,
    background: pack.background,
    sortOrder: pack.sortOrder,
    channels: channelMap(channelRows.filter((c) => c.packId === pack.id)),
    createdAt: pack.createdAt,
    updatedAt: pack.updatedAt,
  };
}

export function toAdminRelease(release: ReleaseRow, channelRows: ChannelRow[]): AdminRelease {
  return {
    id: release.id,
    packId: release.packId,
    name: release.name,
    displayDate: release.displayDate,
    changelogHtml: release.changelogHtml,
    changelogVisible: release.changelogVisible,
    cleanInstall: release.cleanInstall,
    status: release.status,
    importProgress: release.importProgress,
    importMessage: release.importMessage,
    error: release.error,
    sourceFilename: release.sourceFilename,
    sourceFormat: release.sourceFormat,
    minecraft: release.manifest?.minecraft ?? null,
    loader: release.manifest?.loader ?? null,
    sizeBytes: release.sizeBytes,
    fileCount: release.fileCount,
    missing: release.missing,
    channels: channelRows.filter((c) => c.releaseId === release.id).map((c) => c.name),
    createdAt: release.createdAt,
  };
}

export function toPublicReleaseSummary(release: ReleaseRow): PublicReleaseSummary | null {
  if (release.status !== 'ready' || !release.manifest) return null;
  return {
    id: release.id,
    name: release.name,
    displayDate: release.displayDate,
    changelogHtml: release.changelogVisible ? release.changelogHtml : null,
    minecraft: release.manifest.minecraft,
    loader: release.manifest.loader,
    sizeBytes: release.sizeBytes,
  };
}
