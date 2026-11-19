import type { FastifyInstance } from 'fastify';
import { settingsBodySchema, type AdminSettings } from '@mmp/schema';
import { eq } from 'drizzle-orm';
import type { AppContext } from '../context';
import { media } from '../db/schema';
import { badRequest } from '../lib/errors';
import { parse } from '../lib/validate';
import { requireAdmin } from '../services/auth';

export async function adminSettingsRoutes(app: FastifyInstance, ctx: AppContext) {
  const { settings, db } = ctx;
  app.addHook('preHandler', requireAdmin(ctx));

  const current = (): AdminSettings => ({
    communityName: settings.get('communityName'),
    publicUrl: settings.get('publicUrl'),
    hasCurseforgeApiKey: settings.get('curseforgeApiKey') !== '',
    launcherLogo: settings.get('launcherLogo'),
    launcherBackground: settings.get('launcherBackground'),
  });

  const assertImage = (sha: string | null) => {
    if (sha && !db.select().from(media).where(eq(media.sha256, sha)).get()) {
      throw badRequest('Upload the image before saving');
    }
  };

  app.get('/admin/settings', async () => current());

  app.patch('/admin/settings', async (request) => {
    const body = parse(settingsBodySchema, request.body);
    if (body.launcherLogo !== undefined) assertImage(body.launcherLogo);
    if (body.launcherBackground !== undefined) assertImage(body.launcherBackground);
    if (body.communityName !== undefined) settings.set('communityName', body.communityName);
    if (body.publicUrl !== undefined) settings.set('publicUrl', body.publicUrl.replace(/\/+$/, ''));
    if (body.curseforgeApiKey !== undefined) settings.set('curseforgeApiKey', body.curseforgeApiKey);
    if (body.launcherLogo !== undefined) settings.set('launcherLogo', body.launcherLogo);
    if (body.launcherBackground !== undefined) settings.set('launcherBackground', body.launcherBackground);
    return current();
  });
}
