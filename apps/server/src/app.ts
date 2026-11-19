import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
import type { IncomingMessage } from 'node:http';

type ContentTypeParser = (
  request: FastifyRequest,
  payload: IncomingMessage,
  done: (err: Error | null, body?: unknown) => void,
) => void;
import { API_VERSION, API_VERSION_HEADER, type ApiError } from '@mmp/schema';
import type { AppContext } from './context';
import { HttpError } from './lib/errors';
import { adminAuthRoutes } from './routes/admin-auth';
import { adminGroupRoutes } from './routes/admin-groups';
import { adminPackRoutes } from './routes/admin-packs';
import { adminSettingsRoutes } from './routes/admin-settings';
import { adminSystemRoutes } from './routes/admin-system';
import { joinRoutes } from './routes/join';
import { adminUploadRoutes } from './routes/admin-uploads';
import { mediaRoutes } from './routes/media';
import { publicRoutes } from './routes/public';
import { adminReportRoutes, reportRoutes } from './routes/reports';
import { ImportQueue } from './services/imports';

export const API_PREFIX = '/api/v1';

export type AppDeps = Omit<AppContext, 'imports'>;

export async function buildApp(
  deps: AppDeps,
  options: { logger?: boolean | object } = {},
): Promise<{ app: FastifyInstance; ctx: AppContext }> {
  const app = Fastify({
    logger: options.logger ?? { level: deps.config.logLevel },
    trustProxy: deps.config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });
  const ctx: AppContext = { ...deps, imports: new ImportQueue({ ...deps, log: app.log }) };
  /** Lets the health page tell whether the public URL really reaches this process. */
  const instanceId = randomBytes(12).toString('hex');

  // Raw bodies (upload chunks, images) are handed to routes as streams.
  const passStream: ContentTypeParser = (_request, payload, done) => done(null, payload);
  app.addContentTypeParser('application/octet-stream', passStream);
  app.addContentTypeParser(/^image\//, passStream);

  app.setErrorHandler<FastifyError | HttpError>((error, request, reply) => {
    if (error instanceof HttpError) {
      const body: ApiError = { error: error.code, message: error.message, details: error.details };
      return reply.status(error.statusCode).send(body);
    }
    const status = error.statusCode;
    if (status && status >= 400 && status < 500) {
      const body: ApiError = { error: error.code ?? 'bad_request', message: error.message };
      return reply.status(status).send(body);
    }
    request.log.error({ err: error }, 'unhandled error');
    const body: ApiError = { error: 'internal', message: 'Something went wrong on the server' };
    return reply.status(500).send(body);
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  await app.register(
    async (api) => {
      // Lets the launcher refuse a server it can't talk to, instead of failing in odd ways.
      api.addHook('onSend', async (_request, reply) => {
        reply.header(API_VERSION_HEADER, String(API_VERSION));
      });
      await api.register((i) => publicRoutes(i, ctx));
      await api.register((i) => reportRoutes(i, ctx));
      await api.register((i) => adminAuthRoutes(i, ctx));
      await api.register((i) => adminPackRoutes(i, ctx));
      await api.register((i) => adminUploadRoutes(i, ctx));
      await api.register((i) => adminGroupRoutes(i, ctx));
      await api.register((i) => adminSettingsRoutes(i, ctx));
      await api.register((i) => adminReportRoutes(i, ctx));
      await api.register((i) => adminSystemRoutes(i, ctx, instanceId));
    },
    { prefix: API_PREFIX },
  );
  await app.register((i) => mediaRoutes(i, ctx));
  await app.register((i) => joinRoutes(i, ctx));

  app.get('/healthz', async () => ({ ok: true, instance: instanceId }));

  const panelDir = ctx.config.panelDir;
  if (panelDir && existsSync(panelDir)) {
    // wildcard: true looks files up per request, so rebuilding the panel doesn't need a server restart.
    await app.register(fastifyStatic, { root: panelDir, wildcard: true });
    // Client-side routes (e.g. /packs/abc/versions) all load the panel's index.html. Missing files
    // (a path with an extension, like an old /assets/*.js) get a real 404 instead of HTML.
    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split('?')[0]!;
      const isPageRoute = !/\.[a-z0-9]+$/i.test(path);
      if (request.method === 'GET' && isPageRoute && !path.startsWith('/api/') && !path.startsWith('/media/')) {
        return reply.sendFile('index.html');
      }
      const body: ApiError = { error: 'not_found', message: `No route for ${request.method} ${request.url.split('?')[0]}` };
      return reply.status(404).send(body);
    });
  } else {
    app.setNotFoundHandler((request, reply) => {
      const body: ApiError = { error: 'not_found', message: `No route for ${request.method} ${request.url.split('?')[0]}` };
      return reply.status(404).send(body);
    });
  }

  return { app, ctx };
}
