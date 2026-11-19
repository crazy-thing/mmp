import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../src/app';
import type { AppContext } from '../src/context';
import { openDatabase } from '../src/db';
import type { MojangClient, MojangProfile } from '../src/lib/mojang';
import { ensureDevelopersGroup } from '../src/routes/admin-groups';
import { SettingsService } from '../src/services/settings';
import { createLocalBlobStore } from '../src/storage/blob-store';

export interface TestServer {
  app: FastifyInstance;
  ctx: AppContext;
  dir: string;
  /** Usernames Mojang will confirm in hasJoined. */
  joined: Map<string, MojangProfile>;
  /** Usernames that exist for lookups. */
  accounts: Map<string, MojangProfile>;
  close(): Promise<void>;
}

export async function createTestServer(fetchFn: typeof fetch = fetch): Promise<TestServer> {
  const dir = await mkdtemp(join(tmpdir(), 'mmp-server-'));
  const { db, close } = openDatabase(join(dir, 'mmp.db'));
  const tmp = join(dir, 'tmp');
  const joined = new Map<string, MojangProfile>();
  const accounts = new Map<string, MojangProfile>();
  const mojang: MojangClient = {
    lookupUsername: async (username) => accounts.get(username.toLowerCase()) ?? null,
    hasJoined: async (username) => joined.get(username) ?? null,
  };
  ensureDevelopersGroup(db);
  const { app, ctx } = await buildApp(
    {
      config: {
        host: '127.0.0.1',
        port: 0,
        dataDir: dir,
        panelDir: null,
        secureCookies: false,
        trustProxy: false,
        logLevel: 'silent',
        version: '5.0.0',
        updateFeed: null,
      },
      db,
      blobs: createLocalBlobStore(join(dir, 'blobs'), tmp),
      settings: new SettingsService(db),
      mojang,
      tmpDir: tmp,
      fetch: fetchFn,
    },
    { logger: false },
  );
  await app.ready();
  return {
    app,
    ctx,
    dir,
    joined,
    accounts,
    async close() {
      await app.close();
      close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export function sessionCookie(res: LightMyRequestResponse): string {
  const cookie = res.cookies.find((c) => c.name === 'mmp_session');
  if (!cookie) throw new Error(`No session cookie (status ${res.statusCode}: ${res.body})`);
  return `mmp_session=${cookie.value}`;
}

/** Uploads a buffer through the resumable upload API in small chunks. */
export async function uploadFile(
  app: FastifyInstance,
  cookie: string,
  filename: string,
  data: Buffer,
  chunkSize = 64,
): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/admin/uploads',
    headers: { cookie },
    payload: { filename, size: data.length },
  });
  const { id } = created.json() as { id: string };
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/uploads/${id}`,
      headers: { cookie, 'content-type': 'application/octet-stream', 'upload-offset': String(offset) },
      payload: data.subarray(offset, offset + chunkSize),
    });
    if (res.statusCode !== 200) throw new Error(`chunk failed: ${res.body}`);
  }
  return id;
}

/** Smallest valid PNG header, enough for type sniffing. */
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
