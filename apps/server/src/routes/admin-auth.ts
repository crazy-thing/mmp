import type { FastifyInstance } from 'fastify';
import {
  changePasswordBodySchema,
  loginBodySchema,
  setupBodySchema,
  setupCheckBodySchema,
  type AdminUser,
  type SetupStatus,
} from '@mmp/schema';
import { count, eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { adminSessions, adminUsers } from '../db/schema';
import { badRequest, conflict, unauthorized } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { hashPassword, verifyDummyPassword, verifyPassword } from '../lib/passwords';
import { parse } from '../lib/validate';
import {
  SESSION_COOKIE,
  createAdminSession,
  deleteAdminSession,
  requireAdmin,
  setSessionCookie,
} from '../services/auth';
import { clearSetupCode, needsSetup, setupCodeMatches } from '../services/setup';

export async function adminAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const setupLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  /** Whoever reaches a fresh server first would otherwise get to own it, so setup needs the code from the log. */
  const assertSetupCode = (code: string) => {
    if (!needsSetup(db)) throw conflict('Setup has already been completed');
    if (!setupCodeMatches(ctx.settings, code)) {
      throw unauthorized("That setup code isn't right. It's printed in the server log when the server starts.");
    }
  };

  app.get('/admin/setup', async (): Promise<SetupStatus> => ({
    needsSetup: needsSetup(db),
    communityName: ctx.settings.get('communityName'),
  }));

  /** Lets the setup page check the code before asking for account details. */
  app.post('/admin/setup/check', setupLimit, async (request) => {
    assertSetupCode(parse(setupCheckBodySchema, request.body).code);
    return { ok: true };
  });

  /** First-run only: creates the owner account. Disabled once any admin exists. */
  app.post('/admin/setup', setupLimit, async (request, reply) => {
    const body = parse(setupBodySchema, request.body);
    assertSetupCode(body.code);
    const passwordHash = await hashPassword(body.password);
    const user = { id: newId(), username: body.username, role: 'owner' as const };
    db.transaction((tx) => {
      if ((tx.select({ n: count() }).from(adminUsers).get()?.n ?? 0) > 0) {
        throw conflict('Setup has already been completed');
      }
      tx.insert(adminUsers).values({ ...user, passwordHash, createdAt: nowIso() }).run();
    });
    ctx.settings.set('communityName', body.communityName);
    await clearSetupCode(ctx.settings, ctx.config.dataDir);
    const session = createAdminSession(db, user.id);
    setSessionCookie(ctx, reply, session.token, session.expires);
    return user satisfies AdminUser;
  });

  app.post('/admin/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parse(loginBodySchema, request.body);
    const user = db.select().from(adminUsers).where(eq(adminUsers.username, body.username)).get();
    if (!user) {
      await verifyDummyPassword(body.password);
      throw unauthorized('Wrong username or password');
    }
    if (!(await verifyPassword(body.password, user.passwordHash))) {
      throw unauthorized('Wrong username or password');
    }
    const session = createAdminSession(db, user.id);
    setSessionCookie(ctx, reply, session.token, session.expires);
    return { id: user.id, username: user.username, role: user.role } satisfies AdminUser;
  });

  app.post('/admin/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) deleteAdminSession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/admin/me', { preHandler: requireAdmin(ctx) }, async (request) => request.admin!);

  app.post(
    '/admin/me/password',
    { preHandler: requireAdmin(ctx), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = parse(changePasswordBodySchema, request.body);
      const user = db.select().from(adminUsers).where(eq(adminUsers.id, request.admin!.id)).get();
      if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw badRequest('Current password is wrong');
      }
      db.update(adminUsers)
        .set({ passwordHash: await hashPassword(body.newPassword) })
        .where(eq(adminUsers.id, user.id))
        .run();
      // Sign out every other device.
      db.delete(adminSessions).where(eq(adminSessions.userId, user.id)).run();
      const session = createAdminSession(db, user.id);
      setSessionCookie(ctx, reply, session.token, session.expires);
      return { ok: true };
    },
  );
}
