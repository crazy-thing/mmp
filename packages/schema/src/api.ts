import { z } from 'zod';
import type { Loader } from './manifest';

// ---------- Shared enums ----------

/**
 * released: listed for everyone.
 * dev: listed only for players in the Developers group.
 * unreleased: hidden from the launcher.
 */
export const PACK_STATUSES = ['released', 'dev', 'unreleased'] as const;
export type PackStatus = (typeof PACK_STATUSES)[number];

/** stable is what v4 called "Current". dev is only served to the Developers group. */
export const CHANNELS = ['stable', 'dev'] as const;
export type ChannelName = (typeof CHANNELS)[number];

export const RELEASE_STATUSES = ['importing', 'needs_files', 'ready', 'failed'] as const;
export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const MEDIA_KINDS = ['thumbnail', 'banner', 'background', 'screenshot', 'logo'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const ADMIN_ROLES = ['owner', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// ---------- Errors ----------

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

// ---------- Public (launcher-facing) DTOs ----------

export interface LauncherConfig {
  name: string;
  /** Title art shown on the loading screen. Without one the launcher shows `name` as text. */
  logoUrl: string | null;
  backgroundUrl: string | null;
  links: { label: string; url: string }[];
}

export interface PublicReleaseSummary {
  id: string;
  name: string;
  displayDate: string;
  /** Sanitised HTML. Null when the creator hid this changelog. */
  changelogHtml: string | null;
  minecraft: string;
  loader: Loader;
  sizeBytes: number;
}

export interface PublicPack {
  id: string;
  slug: string;
  name: string;
  status: PackStatus;
  thumbnailUrl: string | null;
  bannerUrl: string | null;
  backgroundUrl: string | null;
  /** Channels this player may install, with the release each one points at. */
  channels: Partial<Record<ChannelName, PublicReleaseSummary>>;
  /** Changelog history: ready releases with a visible changelog, newest first. */
  changelogs: { id: string; name: string; displayDate: string; changelogHtml: string }[];
}

export interface PublicScreenshot {
  id: string;
  url: string;
}

export const playerVerifyBodySchema = z.object({
  username: z.string().min(1).max(32),
  serverId: z.string().min(1).max(64),
});

export interface PlayerChallenge {
  serverId: string;
}

/** Members of this group see dev packs and the dev channel. */
export const DEVELOPERS_GROUP = 'Developers';

export interface PlayerSession {
  token: string;
  expiresAt: string;
  player: { uuid: string; username: string; groups: string[] };
}

// ---------- Admin DTOs ----------

export interface AdminUser {
  id: string;
  username: string;
  role: AdminRole;
}

export interface SetupStatus {
  needsSetup: boolean;
  communityName: string;
}

/** The one-time code the server prints in its log on first start. Dashes and spaces are ignored. */
const setupCode = z.string().trim().min(1).max(64);

export const setupCheckBodySchema = z.object({ code: setupCode });

export const setupBodySchema = z.object({
  code: setupCode,
  username: z.string().trim().min(3).max(32),
  password: z.string().min(10).max(200),
  communityName: z.string().trim().min(1).max(64),
});

export const loginBodySchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(200),
});

export interface AdminPack {
  id: string;
  slug: string;
  name: string;
  status: PackStatus;
  thumbnail: string | null;
  banner: string | null;
  background: string | null;
  sortOrder: number;
  channels: Record<ChannelName, string | null>;
  createdAt: string;
  updatedAt: string;
}

/** Image fields hold a media sha256, or null to clear. */
export const packBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  status: z.enum(PACK_STATUSES),
  thumbnail: z.string().nullable(),
  banner: z.string().nullable(),
  background: z.string().nullable(),
  sortOrder: z.number().int().optional(),
});
export type PackBody = z.infer<typeof packBodySchema>;

export interface MissingFile {
  path: string;
  fileName: string;
  size: number;
  sha1: string;
  projectName: string;
  /** Where the creator can download the file by hand. */
  pageUrl: string | null;
}

export interface AdminRelease {
  id: string;
  packId: string;
  name: string;
  displayDate: string;
  changelogHtml: string;
  changelogVisible: boolean;
  /** Launchers wipe the instance folder before installing this release over a different one. */
  cleanInstall: boolean;
  status: ReleaseStatus;
  importProgress: number;
  importMessage: string;
  error: string | null;
  sourceFilename: string;
  sourceFormat: 'curseforge' | 'modrinth' | null;
  minecraft: string | null;
  loader: Loader | null;
  sizeBytes: number;
  fileCount: number;
  missing: MissingFile[];
  channels: ChannelName[];
  createdAt: string;
}

export const releaseCreateBodySchema = z.object({
  uploadId: z.string().min(1),
  name: z.string().trim().min(1).max(64),
  displayDate: z.string().trim().max(64).default(''),
  changelogHtml: z.string().max(500_000).default(''),
  changelogVisible: z.boolean().default(true),
  cleanInstall: z.boolean().default(false),
});
export type ReleaseCreateBody = z.infer<typeof releaseCreateBodySchema>;

export const releaseUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  displayDate: z.string().trim().max(64).optional(),
  changelogHtml: z.string().max(500_000).optional(),
  changelogVisible: z.boolean().optional(),
  cleanInstall: z.boolean().optional(),
});
export type ReleaseUpdateBody = z.infer<typeof releaseUpdateBodySchema>;

export const releaseReimportBodySchema = z.object({ uploadId: z.string().min(1) });

export const resolveMissingBodySchema = z.object({
  path: z.string().min(1),
  uploadId: z.string().min(1),
});

export const channelBodySchema = z.object({ releaseId: z.string().nullable() });

export const uploadCreateBodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(20 * 1024 ** 3),
});

export interface UploadSession {
  id: string;
  received: number;
  size: number;
  chunkSize: number;
}

export interface Media {
  id: string;
  sha256: string;
  kind: MediaKind;
  /** Set for screenshots that belong to one pack. Null for the server-wide (website) set. */
  packId: string | null;
  url: string;
}

export interface GroupMember {
  uuid: string;
  username: string;
  addedAt: string;
}

export const groupMemberBodySchema = z.object({
  username: z.string().trim().regex(/^[A-Za-z0-9_]{1,16}$/, 'Not a valid Minecraft username'),
});

export interface AdminSettings {
  communityName: string;
  publicUrl: string;
  hasCurseforgeApiKey: boolean;
  /** Media sha256 of the launcher's title art and background. */
  launcherLogo: string | null;
  launcherBackground: string | null;
}

export const settingsBodySchema = z.object({
  communityName: z.string().trim().min(1).max(64).optional(),
  publicUrl: z.union([z.literal(''), z.url()]).optional(),
  launcherLogo: z.string().nullable().optional(),
  launcherBackground: z.string().nullable().optional(),
  /** Empty string clears the key. */
  curseforgeApiKey: z.string().trim().max(200).optional(),
});
export type SettingsBody = z.infer<typeof settingsBodySchema>;

// ---------- server status ----------

export type HealthLevel = 'ok' | 'warn' | 'error' | 'off';

export interface HealthCheck {
  id: string;
  label: string;
  level: HealthLevel;
  message: string;
}

export interface ServerHealth {
  version: string;
  checks: HealthCheck[];
}

export interface UpdateStatus {
  current: string;
  /** Newest server release on the update feed, or null if it couldn't be read. */
  latest: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  checkedAt: string | null;
  /** Why the check failed, or that it's switched off. */
  error: string | null;
}

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10).max(200),
});

export const REPORT_KINDS = ['crash', 'bug'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

/** What the launcher posts. The server fills in the player from the token, if there is one. */
export const reportBodySchema = z
  .object({
    kind: z.enum(REPORT_KINDS),
    message: z.string().trim().max(2000).default(''),
    sessionLog: z.string().max(100_000),
    gameLog: z.string().max(120_000).nullable().optional(),
    packSlug: z.string().max(64).nullable().optional(),
    packName: z.string().max(80).nullable().optional(),
    releaseName: z.string().max(64).nullable().optional(),
    launcherVersion: z.string().trim().min(1).max(32),
  })
  .refine((body) => body.kind === 'crash' || body.message.length > 0, { message: 'Describe the bug' });
export type ReportBody = z.infer<typeof reportBodySchema>;

export interface ReportSummary {
  id: string;
  kind: ReportKind;
  message: string;
  packSlug: string | null;
  packName: string | null;
  releaseName: string | null;
  launcherVersion: string;
  playerName: string | null;
  createdAt: string;
}

export interface ReportDetail extends ReportSummary {
  sessionLog: string;
  gameLog: string | null;
  playerUuid: string | null;
}

export interface ReportCreated {
  id: string;
  createdAt: string;
}
