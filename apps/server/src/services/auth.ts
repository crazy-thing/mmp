import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DEVELOPERS_GROUP, type AdminUser } from '@mmp/schema';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { adminSessions, adminUsers, groupMembers, groups } from '../db/schema';
import { unauthorized } from '../lib/errors';
import { newToken, nowIso } from '../lib/ids';
import { verifyPlayerToken } from '../lib/player-token';

export const SESSION_COOKIE = 'mmp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export { DEVELOPERS_GROUP };

export interface PlayerIdentity {
  uuid: string;
  username: string;
  groups: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminUser;
  }
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createAdminSession(db: Db, userId: string): { token: string; expires: Date } {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(adminSessions)
    .values({ tokenHash: hashToken(token), userId, expiresAt: expires.toISOString(), createdAt: nowIso() })
    .run();
  db.delete(adminSessions).where(lt(adminSessions.expiresAt, nowIso())).run();
  return { token, expires };
}

export function deleteAdminSession(db: Db, token: string): void {
  db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token))).run();
}

export function setSessionCookie(ctx: AppContext, reply: FastifyReply, token: string, expires: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: ctx.config.secureCookies,
    expires,
  });
}

/** preHandler for every /api/v1/admin route except login and setup. */
export function requireAdmin(ctx: AppContext) {
  return async (request: FastifyRequest) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) throw unauthorized();
    const row = ctx.db
      .select({ id: adminUsers.id, username: adminUsers.username, role: adminUsers.role })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.userId))
      .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, nowIso())))
      .get();
    if (!row) throw unauthorized('Your session has expired. Sign in again.');
    request.admin = row;
  };
}

/** Reads an optional player token from `Authorization: Bearer`. Invalid tokens are rejected, not ignored. */
export function getPlayer(ctx: AppContext, request: FastifyRequest): PlayerIdentity | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const claims = verifyPlayerToken(token, ctx.settings.get('playerTokenSecret'));
  if (!claims) throw unauthorized('Player session expired. Sign in again.');
  return { uuid: claims.uuid, username: claims.username, groups: playerGroups(ctx.db, claims.uuid) };
}

export function playerGroups(db: Db, uuid: string): string[] {
  return db
    .select({ name: groups.name })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(eq(groupMembers.uuid, uuid))
    .all()
    .map((g) => g.name);
}

export const isDeveloper = (player: PlayerIdentity | null) => player?.groups.includes(DEVELOPERS_GROUP) ?? false;
