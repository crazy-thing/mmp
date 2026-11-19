import type { FastifyInstance } from 'fastify';
import type { ServerHealth, UpdateStatus } from '@mmp/schema';
import type { AppContext } from '../context';
import { requireAdmin } from '../services/auth';
import { serverHealth } from '../services/health';
import { UpdateChecker } from '../services/updates';

export async function adminSystemRoutes(app: FastifyInstance, ctx: AppContext, instanceId: string) {
  app.addHook('preHandler', requireAdmin(ctx));
  const updates = new UpdateChecker(ctx.config.version, ctx.config.updateFeed, ctx.fetch);

  app.get('/admin/system/health', async (): Promise<ServerHealth> => serverHealth(ctx, instanceId));

  app.get<{ Querystring: { refresh?: string } }>(
    '/admin/system/update',
    async (request): Promise<UpdateStatus> => updates.status(request.query.refresh === '1'),
  );
}
