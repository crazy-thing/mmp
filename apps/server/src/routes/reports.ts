import type { FastifyInstance } from 'fastify';
import {
  reportBodySchema,
  type ReportCreated,
  type ReportDetail,
  type ReportKind,
  type ReportSummary,
} from '@mmp/schema';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppContext } from '../context';
import { reports } from '../db/schema';
import { notFound } from '../lib/errors';
import { newId, nowIso } from '../lib/ids';
import { parse } from '../lib/validate';
import { getPlayer, requireAdmin } from '../services/auth';

const idParams = z.object({ id: z.string().min(1).max(32) });

/** Players (and a launcher with no account) can file a crash or a bug. */
export async function reportRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post(
    '/reports',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request): Promise<ReportCreated> => {
      const body = parse(reportBodySchema, request.body);
      const player = getPlayer(ctx, request);
      const id = newId();
      const createdAt = nowIso();
      ctx.db
        .insert(reports)
        .values({
          id,
          kind: body.kind,
          message: body.message,
          sessionLog: body.sessionLog,
          gameLog: body.gameLog ?? null,
          packSlug: body.packSlug ?? null,
          packName: body.packName ?? null,
          releaseName: body.releaseName ?? null,
          launcherVersion: body.launcherVersion,
          playerUuid: player?.uuid ?? null,
          playerName: player?.username ?? null,
          createdAt,
        })
        .run();
      return { id, createdAt };
    },
  );
}

/** The panel's bug-report page. */
export async function adminReportRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  app.addHook('preHandler', requireAdmin(ctx));

  app.get('/admin/reports', async (): Promise<ReportSummary[]> => {
    return db.select().from(reports).orderBy(desc(reports.createdAt)).limit(200).all().map(toSummary);
  });

  app.get('/admin/reports/:id', async (request): Promise<ReportDetail> => {
    const { id } = parse(idParams, request.params);
    const row = db.select().from(reports).where(eq(reports.id, id)).get();
    if (!row) throw notFound('Report');
    return { ...toSummary(row), sessionLog: row.sessionLog, gameLog: row.gameLog, playerUuid: row.playerUuid };
  });

  app.delete('/admin/reports/:id', async (request) => {
    const { id } = parse(idParams, request.params);
    const row = db.delete(reports).where(eq(reports.id, id)).returning().get();
    if (!row) throw notFound('Report');
    return { ok: true as const };
  });
}

function toSummary(row: {
  id: string;
  kind: string;
  message: string;
  packSlug: string | null;
  packName: string | null;
  releaseName: string | null;
  launcherVersion: string;
  playerName: string | null;
  createdAt: string;
}): ReportSummary {
  return {
    id: row.id,
    kind: row.kind as ReportKind,
    message: row.message,
    packSlug: row.packSlug,
    packName: row.packName,
    releaseName: row.releaseName,
    launcherVersion: row.launcherVersion,
    playerName: row.playerName,
    createdAt: row.createdAt,
  };
}
