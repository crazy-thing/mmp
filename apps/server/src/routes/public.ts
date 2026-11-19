import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  CHANNELS,
  MANIFEST_SCHEMA_VERSION,
  playerVerifyBodySchema,
  type ChannelName,
  type LauncherConfig,
  type Manifest,
  type PlayerChallenge,
  type PlayerSession,
  type PublicPack,
} from '@mmp/schema';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context';
import { channels, packs, releases } from '../db/schema';
import { HttpError, notFound, unauthorized } from '../lib/errors';
import { PLAYER_TOKEN_TTL_SECONDS, signPlayerToken } from '../lib/player-token';
import { parse } from '../lib/validate';
import { canSeePack, canUseChannel } from '../services/access';
import { getPlayer, playerGroups, type PlayerIdentity } from '../services/auth';
import { mediaUrl, toPublicReleaseSummary } from '../services/dto';

const CHALLENGE_TTL_MS = 2 * 60 * 1000;
const MAX_PENDING_CHALLENGES = 10_000;

export async function publicRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const challenges = new Map<string, number>();

  // ---------- launcher config ----------

  app.get('/launcher/config', async (): Promise<LauncherConfig> => ({
    name: ctx.settings.get('communityName'),
    logoUrl: mediaUrl(ctx.settings.get('launcherLogo')),
    backgroundUrl: mediaUrl(ctx.settings.get('launcherBackground')),
    links: [],
  }));

  // ---------- player sign-in (Minecraft session handshake) ----------

  app.post('/auth/challenge', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (): Promise<PlayerChallenge> => {
    const now = Date.now();
    for (const [id, expires] of challenges) if (expires < now) challenges.delete(id);
    if (challenges.size >= MAX_PENDING_CHALLENGES) {
      throw new HttpError(503, 'busy', 'Too many sign-ins in progress. Try again shortly.');
    }
    const serverId = randomBytes(20).toString('hex');
    challenges.set(serverId, now + CHALLENGE_TTL_MS);
    return { serverId };
  });

  app.post('/auth/verify', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request): Promise<PlayerSession> => {
    const body = parse(playerVerifyBodySchema, request.body);
    const expires = challenges.get(body.serverId);
    challenges.delete(body.serverId);
    if (!expires || expires < Date.now()) throw unauthorized('Sign-in challenge expired. Try again.');

    let profile;
    try {
      profile = await ctx.mojang.hasJoined(body.username, body.serverId);
    } catch {
      throw new HttpError(502, 'mojang_unavailable', 'Could not reach Mojang to verify your account');
    }
    if (!profile) throw unauthorized('Mojang could not confirm this Minecraft account');

    const exp = Math.floor(Date.now() / 1000) + PLAYER_TOKEN_TTL_SECONDS;
    const token = signPlayerToken({ uuid: profile.id, username: profile.name, exp }, ctx.settings.get('playerTokenSecret'));
    return {
      token,
      expiresAt: new Date(exp * 1000).toISOString(),
      player: { uuid: profile.id, username: profile.name, groups: playerGroups(db, profile.id) },
    };
  });

  // ---------- packs ----------

  const buildPublicPack = (pack: typeof packs.$inferSelect, player: PlayerIdentity | null): PublicPack => {
    const packReleases = db
      .select()
      .from(releases)
      .where(eq(releases.packId, pack.id))
      .orderBy(desc(releases.createdAt))
      .all();
    const byId = new Map(packReleases.map((r) => [r.id, r]));

    const available: PublicPack['channels'] = {};
    for (const row of db.select().from(channels).where(eq(channels.packId, pack.id)).all()) {
      if (!row.releaseId || !canUseChannel(pack.status, row.name, player)) continue;
      const release = byId.get(row.releaseId);
      const summary = release && toPublicReleaseSummary(release);
      if (summary) available[row.name] = summary;
    }

    return {
      id: pack.id,
      slug: pack.slug,
      name: pack.name,
      status: pack.status,
      thumbnailUrl: mediaUrl(pack.thumbnail),
      bannerUrl: mediaUrl(pack.banner),
      backgroundUrl: mediaUrl(pack.background),
      channels: available,
      changelogs: packReleases
        .filter((r) => r.status === 'ready' && r.changelogVisible)
        .map((r) => ({ id: r.id, name: r.name, displayDate: r.displayDate, changelogHtml: r.changelogHtml })),
    };
  };

  /** Throws 404 rather than 403 so hidden packs don't reveal that they exist. */
  const findVisiblePack = (slug: string, player: PlayerIdentity | null) => {
    const pack = db.select().from(packs).where(eq(packs.slug, slug)).get();
    if (!pack || !canSeePack(pack.status, player)) throw notFound('Pack');
    return pack;
  };

  const findChannelRelease = (slug: string, channelParam: string, player: PlayerIdentity | null) => {
    const pack = findVisiblePack(slug, player);
    const channel = parse(z.enum(CHANNELS), channelParam) as ChannelName;
    if (!canUseChannel(pack.status, channel, player)) throw notFound('Channel');
    const row = db
      .select()
      .from(channels)
      .where(and(eq(channels.packId, pack.id), eq(channels.name, channel)))
      .get();
    const release = row?.releaseId ? db.select().from(releases).where(eq(releases.id, row.releaseId)).get() : undefined;
    if (!release || release.status !== 'ready' || !release.manifest) throw notFound('Release');
    return { pack, release, manifest: release.manifest };
  };

  app.get('/packs', async (request): Promise<PublicPack[]> => {
    const player = getPlayer(ctx, request);
    return db
      .select()
      .from(packs)
      .orderBy(asc(packs.sortOrder), asc(packs.createdAt))
      .all()
      .filter((p) => canSeePack(p.status, player))
      .map((p) => buildPublicPack(p, player));
  });

  app.get<{ Params: { slug: string } }>('/packs/:slug', async (request) => {
    const player = getPlayer(ctx, request);
    return buildPublicPack(findVisiblePack(request.params.slug, player), player);
  });

  app.get<{ Params: { slug: string; channel: string } }>(
    '/packs/:slug/channels/:channel/manifest',
    async (request, reply): Promise<Manifest> => {
      const { pack, release, manifest } = findChannelRelease(
        request.params.slug,
        request.params.channel,
        getPlayer(ctx, request),
      );
      reply.header('cache-control', 'no-store');
      return {
        schema: MANIFEST_SCHEMA_VERSION,
        pack: { id: pack.id, slug: pack.slug, name: pack.name },
        release: { id: release.id, name: release.name },
        minecraft: manifest.minecraft,
        loader: manifest.loader,
        jvmArgs: [],
        ...(release.cleanInstall ? { cleanInstall: true } : {}),
        files: manifest.files,
      };
    },
  );

  /** Serves a file stored on this server, only if it belongs to a release the player may install. */
  app.get<{ Params: { slug: string; channel: string; sha256: string } }>(
    '/packs/:slug/channels/:channel/files/:sha256',
    async (request, reply) => {
      const { manifest } = findChannelRelease(request.params.slug, request.params.channel, getPlayer(ctx, request));
      const file = manifest.files.find((f) => f.source.type === 'blob' && f.hashes.sha256 === request.params.sha256);
      if (!file) throw notFound('File');
      return reply
        .header('content-type', 'application/octet-stream')
        .header('content-length', file.size)
        .header('cache-control', 'private, max-age=31536000, immutable')
        .send(ctx.blobs.open(request.params.sha256));
    },
  );
}
