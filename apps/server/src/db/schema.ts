import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ChannelName, Manifest, MediaKind, MissingFile, PackStatus, ReleaseStatus } from '@mmp/schema';

const timestamps = {
  createdAt: text('created_at').notNull(),
};

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['owner', 'admin'] }).notNull(),
  ...timestamps,
});

export const adminSessions = sqliteTable('admin_sessions', {
  /** sha256 of the cookie value, so a leaked database doesn't leak live sessions. */
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  ...timestamps,
});

export const blobs = sqliteTable('blobs', {
  sha256: text('sha256').primaryKey(),
  sha1: text('sha1').notNull(),
  size: integer('size').notNull(),
  ...timestamps,
});

export const media = sqliteTable(
  'media',
  {
    id: text('id').primaryKey(),
    sha256: text('sha256')
      .notNull()
      .references(() => blobs.sha256),
    kind: text('kind').$type<MediaKind>().notNull(),
    /** Screenshots shown for one pack. Null for every other image and for server-wide screenshots. */
    packId: text('pack_id').references(() => packs.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    ...timestamps,
  },
  (t) => [index('media_kind_idx').on(t.kind), index('media_pack_idx').on(t.packId)],
);

export const packs = sqliteTable('packs', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  status: text('status').$type<PackStatus>().notNull(),
  thumbnail: text('thumbnail'),
  banner: text('banner'),
  background: text('background'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
  updatedAt: text('updated_at').notNull(),
});

export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey(),
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    displayDate: text('display_date').notNull().default(''),
    changelogHtml: text('changelog_html').notNull().default(''),
    changelogVisible: integer('changelog_visible', { mode: 'boolean' }).notNull().default(true),
    cleanInstall: integer('clean_install', { mode: 'boolean' }).notNull().default(false),
    status: text('status').$type<ReleaseStatus>().notNull(),
    importProgress: real('import_progress').notNull().default(0),
    importMessage: text('import_message').notNull().default(''),
    error: text('error'),
    sourceFilename: text('source_filename').notNull(),
    sourceFormat: text('source_format').$type<'curseforge' | 'modrinth'>(),
    /** Files list and loader info. Pack/release names are filled in when served. */
    manifest: text('manifest', { mode: 'json' }).$type<Pick<Manifest, 'minecraft' | 'loader' | 'files'>>(),
    missing: text('missing', { mode: 'json' }).$type<MissingFile[]>().notNull().default([]),
    sizeBytes: integer('size_bytes').notNull().default(0),
    fileCount: integer('file_count').notNull().default(0),
    createdBy: text('created_by'),
    ...timestamps,
  },
  (t) => [index('releases_pack_idx').on(t.packId)],
);

export const channels = sqliteTable(
  'channels',
  {
    packId: text('pack_id')
      .notNull()
      .references(() => packs.id, { onDelete: 'cascade' }),
    name: text('name').$type<ChannelName>().notNull(),
    releaseId: text('release_id').references(() => releases.id, { onDelete: 'set null' }),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.packId, t.name] })],
);

export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  size: integer('size').notNull(),
  received: integer('received').notNull().default(0),
  userId: text('user_id')
    .notNull()
    .references(() => adminUsers.id, { onDelete: 'cascade' }),
  ...timestamps,
});

export const groups = sqliteTable('groups', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  ...timestamps,
});

export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    message: text('message').notNull(),
    sessionLog: text('session_log').notNull(),
    gameLog: text('game_log'),
    packSlug: text('pack_slug'),
    packName: text('pack_name'),
    releaseName: text('release_name'),
    launcherVersion: text('launcher_version').notNull(),
    playerUuid: text('player_uuid'),
    playerName: text('player_name'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('reports_created_idx').on(t.createdAt)],
);

export const groupMembers = sqliteTable(
  'group_members',
  {
    groupId: text('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    /** Minecraft UUID without dashes. Usernames can change, UUIDs can't. */
    uuid: text('uuid').notNull(),
    username: text('username').notNull(),
    addedAt: text('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.uuid] })],
);
