import type { FastifyInstance } from 'fastify';
import { groupMemberBodySchema, type GroupMember } from '@mmp/schema';
import { and, asc, eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import type { Db } from '../db';
import { groupMembers, groups } from '../db/schema';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { parse } from '../lib/validate';
import { DEVELOPERS_GROUP, requireAdmin } from '../services/auth';

export function ensureDevelopersGroup(db: Db): string {
  const existing = db.select().from(groups).where(eq(groups.name, DEVELOPERS_GROUP)).get();
  if (existing) return existing.id;
  const id = newId();
  db.insert(groups).values({ id, name: DEVELOPERS_GROUP, createdAt: nowIso() }).run();
  return id;
}

/** The panel's "DEV Access" page. Members are stored by UUID so renames don't drop access. */
export async function adminGroupRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  app.addHook('preHandler', requireAdmin(ctx));

  app.get('/admin/developers', async (): Promise<GroupMember[]> => {
    const groupId = ensureDevelopersGroup(db);
    return db
      .select()
      .from(groupMembers)
      .where(eq(groupMembers.groupId, groupId))
      .orderBy(asc(groupMembers.username))
      .all()
      .map(({ uuid, username, addedAt }) => ({ uuid, username, addedAt }));
  });

  app.post('/admin/developers', async (request): Promise<GroupMember> => {
    const { username } = parse(groupMemberBodySchema, request.body);
    let profile;
    try {
      profile = await ctx.mojang.lookupUsername(username);
    } catch {
      throw new HttpError(502, 'mojang_unavailable', 'Could not reach Mojang to look up that username. Try again.');
    }
    if (!profile) throw badRequest(`No Minecraft account is named "${username}"`);

    const groupId = ensureDevelopersGroup(db);
    const member = { groupId, uuid: profile.id, username: profile.name, addedAt: nowIso() };
    db.insert(groupMembers)
      .values(member)
      .onConflictDoUpdate({ target: [groupMembers.groupId, groupMembers.uuid], set: { username: profile.name } })
      .run();
    return { uuid: member.uuid, username: member.username, addedAt: member.addedAt };
  });

  app.delete<{ Params: { uuid: string } }>('/admin/developers/:uuid', async (request) => {
    const groupId = ensureDevelopersGroup(db);
    const result = db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.uuid, request.params.uuid)))
      .run();
    if (result.changes === 0) throw notFound('Developer');
    return { ok: true };
  });
}
