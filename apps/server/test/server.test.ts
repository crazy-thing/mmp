import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AdminPack, AdminRelease, LauncherConfig, Manifest, PlayerSession, PublicPack } from '@mmp/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { blobs, media, releases } from '../src/db/schema';
import { collectGarbage } from '../src/services/gc';
import { currentSetupCode } from '../src/services/setup';
import { curseforgeManifest, fakeCurseForge, sha1, sha256, writeZip } from '../../../packages/importers/test/fixtures';
import { PNG, createTestServer, sessionCookie, uploadFile, type TestServer } from './helpers';

let server: TestServer;
let cookie: string;

const modrinthPack = async (path: string, overrides: Record<string, string>) =>
  writeZip(path, {
    'modrinth.index.json': JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.0.0',
      name: 'Test',
      files: [
        {
          path: 'mods/sodium.jar',
          hashes: { sha1: 'a'.repeat(40) },
          downloads: ['https://cdn.modrinth.com/sodium.jar'],
          fileSize: 5,
        },
      ],
      dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
    }),
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [`overrides/${k}`, v])),
  });

async function setup(): Promise<string> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/v1/admin/setup',
    payload: {
      code: currentSetupCode(server.ctx.settings),
      username: 'owner',
      password: 'correct horse battery',
      communityName: 'Migos',
    },
  });
  expect(res.statusCode).toBe(200);
  return sessionCookie(res);
}

async function createPack(status: AdminPack['status'] = 'released'): Promise<AdminPack> {
  const res = await server.app.inject({
    method: 'POST',
    url: '/api/v1/admin/packs',
    headers: { cookie },
    payload: { name: 'Migos SMP', status, thumbnail: null, banner: null, background: null },
  });
  expect(res.statusCode).toBe(200);
  return res.json();
}

async function publishRelease(pack: AdminPack, zipPath: string): Promise<AdminRelease> {
  const uploadId = await uploadFile(server.app, cookie, 'pack.mrpack', await readFile(zipPath));
  const created = await server.app.inject({
    method: 'POST',
    url: `/api/v1/admin/packs/${pack.id}/releases`,
    headers: { cookie },
    payload: { uploadId, name: 'v1.0.0', displayDate: 'Oct 26', changelogHtml: '<p>Hi<script>alert(1)</script></p>' },
  });
  expect(created.statusCode).toBe(200);
  await server.ctx.imports.idle();
  return (await server.app.inject({ url: `/api/v1/admin/releases/${created.json().id}`, headers: { cookie } })).json();
}

async function playerToken(username: string, uuid: string): Promise<string> {
  server.joined.set(username, { id: uuid, name: username });
  const { serverId } = (await server.app.inject({ method: 'POST', url: '/api/v1/auth/challenge' })).json();
  const res = await server.app.inject({ method: 'POST', url: '/api/v1/auth/verify', payload: { username, serverId } });
  expect(res.statusCode).toBe(200);
  return (res.json() as PlayerSession).token;
}

beforeEach(async () => {
  server = await createTestServer();
});
afterEach(() => server.close());

describe('admin auth', () => {
  it('runs first-time setup once, then requires sign-in', async () => {
    expect((await server.app.inject({ url: '/api/v1/admin/setup' })).json()).toMatchObject({ needsSetup: true });
    expect((await server.app.inject({ url: '/api/v1/admin/packs' })).statusCode).toBe(401);

    cookie = await setup();
    expect((await server.app.inject({ url: '/api/v1/admin/me', headers: { cookie } })).json()).toMatchObject({
      username: 'owner',
      role: 'owner',
    });

    const again = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/setup',
      payload: { code: 'AAAA-AAAA-AAAA', username: 'intruder', password: 'another long password', communityName: 'x' },
    });
    expect(again.statusCode).toBe(409);
    // The code is single-use.
    expect(server.ctx.settings.get('setupCode')).toBe('');

    const bad = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { username: 'owner', password: 'wrong password' },
    });
    expect(bad.statusCode).toBe(401);

    const good = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/login',
      payload: { username: 'owner', password: 'correct horse battery' },
    });
    expect(good.statusCode).toBe(200);

    await server.app.inject({ method: 'POST', url: '/api/v1/admin/logout', headers: { cookie } });
    expect((await server.app.inject({ url: '/api/v1/admin/me', headers: { cookie } })).statusCode).toBe(401);
  });

  it('only lets someone with the setup code claim a fresh server', async () => {
    const code = currentSetupCode(server.ctx.settings);
    const attempt = (payload: object) => server.app.inject({ method: 'POST', url: '/api/v1/admin/setup', payload });
    const account = { username: 'owner', password: 'correct horse battery', communityName: 'Migos' };

    expect((await attempt(account)).statusCode).toBe(400);
    expect((await attempt({ ...account, code: 'WRONG-CODE-HERE' })).statusCode).toBe(401);
    expect((await server.app.inject({ url: '/api/v1/admin/setup' })).json()).toMatchObject({ needsSetup: true });

    const check = (c: string) =>
      server.app.inject({ method: 'POST', url: '/api/v1/admin/setup/check', payload: { code: c } });
    expect((await check('nope')).statusCode).toBe(401);
    // Typed in lower case without dashes still counts.
    expect((await check(code.toLowerCase().replaceAll('-', ''))).statusCode).toBe(200);

    expect((await attempt({ ...account, code })).statusCode).toBe(200);
    expect((await check(code)).statusCode).toBe(409);
  });

  it('refuses uploads without a session (v4 accepted them)', async () => {
    const res = await server.app.inject({
      method: 'PUT',
      url: '/api/v1/admin/uploads/anything',
      headers: { 'content-type': 'application/octet-stream', 'upload-offset': '0' },
      payload: Buffer.from('x'),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('media', () => {
  beforeEach(async () => {
    cookie = await setup();
  });

  it('accepts raster images, rejects SVG, and serves them publicly', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/media?kind=thumbnail',
      headers: { cookie, 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(res.statusCode).toBe(200);
    const { sha256: hash, url } = res.json();
    expect(hash).toBe(sha256(PNG));

    const served = await server.app.inject({ url });
    expect(served.headers['content-type']).toBe('image/png');
    expect(served.rawPayload.equals(PNG)).toBe(true);

    const svg = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/media?kind=thumbnail',
      headers: { cookie, 'content-type': 'image/svg+xml' },
      payload: '<svg onload="alert(1)"/>',
    });
    expect(svg.statusCode).toBe(400);
  });

  it('keeps screenshots per pack, falling back to the server-wide set', async () => {
    const pack = await createPack();
    const upload = (query: string) =>
      server.app.inject({ method: 'POST', url: `/api/v1/admin/media?${query}`, headers: { cookie, 'content-type': 'image/png' }, payload: PNG });

    const shared = (await upload('kind=screenshot')).json();
    expect(shared.packId).toBeNull();
    const publicFor = async (slug: string) => (await server.app.inject({ url: `/api/v1/public/screenshots?pack=${slug}` })).json();
    expect((await publicFor(pack.slug)).map((s: { id: string }) => s.id)).toEqual([shared.id]);

    const own = (await upload(`kind=screenshot&pack=${pack.id}`)).json();
    expect(own.packId).toBe(pack.id);
    expect((await publicFor(pack.slug)).map((s: { id: string }) => s.id)).toEqual([own.id]);
    expect((await server.app.inject({ url: '/api/v1/public/screenshots' })).json().map((s: { id: string }) => s.id)).toEqual([shared.id]);
    const adminList = await server.app.inject({ url: `/api/v1/admin/screenshots?pack=${pack.id}`, headers: { cookie } });
    expect(adminList.json().map((s: { id: string }) => s.id)).toEqual([own.id]);

    expect((await upload(`kind=thumbnail&pack=${pack.id}`)).statusCode).toBe(400);

    // Hidden packs don't reveal their screenshots, and deleting a pack removes its own.
    const hidden = await createPack('unreleased');
    expect((await server.app.inject({ url: `/api/v1/public/screenshots?pack=${hidden.slug}` })).statusCode).toBe(404);
    await server.app.inject({ method: 'DELETE', url: `/api/v1/admin/packs/${pack.id}`, headers: { cookie } });
    expect(server.ctx.db.select().from(media).where(eq(media.id, own.id)).get()).toBeUndefined();
  });

  it('refuses to save a pack that points at an image that was never uploaded', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/packs',
      headers: { cookie },
      payload: { name: 'x', status: 'released', thumbnail: 'f'.repeat(64), banner: null, background: null },
    });
    expect(res.statusCode).toBe(400);
  });

  it('brands the launcher with a saved logo and background, and keeps them through cleanup', async () => {
    const logo = (
      await server.app.inject({
        method: 'POST',
        url: '/api/v1/admin/media?kind=logo',
        headers: { cookie, 'content-type': 'image/png' },
        payload: PNG,
      })
    ).json().sha256;
    const saved = await server.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie },
      payload: { launcherLogo: logo, launcherBackground: null },
    });
    expect(saved.json()).toMatchObject({ launcherLogo: logo, launcherBackground: null });

    const missing = await server.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie },
      payload: { launcherBackground: 'f'.repeat(64) },
    });
    expect(missing.statusCode).toBe(400);

    server.ctx.db.update(media).set({ createdAt: '2000-01-01T00:00:00.000Z' }).run();
    server.ctx.db.update(blobs).set({ createdAt: '2000-01-01T00:00:00.000Z' }).run();
    await collectGarbage(server.ctx.db, server.ctx.blobs, server.ctx.settings);

    const config = (await server.app.inject({ url: '/api/v1/launcher/config' })).json() as LauncherConfig;
    expect(config).toMatchObject({ name: 'Migos', logoUrl: `/media/${logo}`, backgroundUrl: null });
    expect((await server.app.inject({ url: config.logoUrl! })).statusCode).toBe(200);
  });
});

describe('uploads', () => {
  beforeEach(async () => {
    cookie = await setup();
  });

  it('rejects chunks at the wrong offset and chunks past the declared size', async () => {
    const { id } = (
      await server.app.inject({
        method: 'POST',
        url: '/api/v1/admin/uploads',
        headers: { cookie },
        payload: { filename: 'a.zip', size: 4 },
      })
    ).json();
    const put = (offset: number, data: string) =>
      server.app.inject({
        method: 'PUT',
        url: `/api/v1/admin/uploads/${id}`,
        headers: { cookie, 'content-type': 'application/octet-stream', 'upload-offset': String(offset) },
        payload: Buffer.from(data),
      });
    expect((await put(2, 'ab')).statusCode).toBe(409);
    expect((await put(0, 'abcdef')).statusCode).toBe(413);
    expect((await put(0, 'ab')).json()).toMatchObject({ received: 2 });
    expect((await put(2, 'cd')).json()).toMatchObject({ received: 4, size: 4 });
  });
});

describe('publishing a pack', () => {
  beforeEach(async () => {
    cookie = await setup();
  });

  it('imports, publishes and serves a manifest and its files', async () => {
    const pack = await createPack();
    const zip = join(server.dir, 'pack.mrpack');
    await modrinthPack(zip, { 'config/a.json': '{"a":1}' });
    const release = await publishRelease(pack, zip);

    expect(release).toMatchObject({ status: 'ready', sourceFormat: 'modrinth', fileCount: 2, minecraft: '1.21.1' });
    expect(release.changelogHtml).toBe('<p>Hi</p>');

    // Not on a channel yet, so the launcher sees the pack but nothing to install.
    let packs: PublicPack[] = (await server.app.inject({ url: '/api/v1/packs' })).json();
    expect(packs[0]?.channels).toEqual({});

    const promote = await server.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/packs/${pack.id}/channels/stable`,
      headers: { cookie },
      payload: { releaseId: release.id },
    });
    expect(promote.json().channels.stable).toBe(release.id);

    packs = (await server.app.inject({ url: '/api/v1/packs' })).json();
    expect(packs[0]?.channels.stable).toMatchObject({ name: 'v1.0.0', loader: { type: 'fabric', version: '0.16.5' } });

    const manifest: Manifest = (
      await server.app.inject({ url: `/api/v1/packs/${pack.slug}/channels/stable/manifest` })
    ).json();
    expect(manifest).toMatchObject({ schema: 1, minecraft: '1.21.1', pack: { slug: 'migos-smp' } });
    const config = manifest.files.find((f) => f.path === 'config/a.json')!;
    expect(config.source.type).toBe('blob');

    const file = await server.app.inject({
      url: `/api/v1/packs/${pack.slug}/channels/stable/files/${config.hashes.sha256}`,
    });
    expect(file.statusCode).toBe(200);
    expect(file.body).toBe('{"a":1}');

    // Files that aren't in this release's manifest aren't served, even if stored.
    const other = await server.app.inject({
      url: `/api/v1/packs/${pack.slug}/channels/stable/files/${'0'.repeat(64)}`,
    });
    expect(other.statusCode).toBe(404);

    // A live release can't have its files swapped out.
    const uploadId = await uploadFile(server.app, cookie, 'pack.mrpack', await readFile(zip));
    const reimport = await server.app.inject({
      method: 'POST',
      url: `/api/v1/admin/releases/${release.id}/reimport`,
      headers: { cookie },
      payload: { uploadId },
    });
    expect(reimport.statusCode).toBe(409);
  });

  it('tells launchers to clean install when the release asks for it', async () => {
    const pack = await createPack();
    const zip = join(server.dir, 'pack.mrpack');
    await modrinthPack(zip, {});
    const release = await publishRelease(pack, zip);
    expect(release.cleanInstall).toBe(false);
    await server.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/packs/${pack.id}/channels/stable`,
      headers: { cookie },
      payload: { releaseId: release.id },
    });
    const manifestUrl = `/api/v1/packs/${pack.slug}/channels/stable/manifest`;
    expect((await server.app.inject({ url: manifestUrl })).json().cleanInstall).toBeUndefined();

    const updated = await server.app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/releases/${release.id}`,
      headers: { cookie },
      payload: { cleanInstall: true },
    });
    expect(updated.json().cleanInstall).toBe(true);
    expect((await server.app.inject({ url: manifestUrl })).json().cleanInstall).toBe(true);
  });

  it('marks a bad upload as failed with a readable error', async () => {
    const pack = await createPack();
    const zip = join(server.dir, 'junk.zip');
    await writeZip(zip, { 'readme.txt': 'hi' });
    const release = await publishRelease(pack, zip);
    expect(release.status).toBe('failed');
    expect(release.error).toMatch(/Unrecognised pack/);
  });

  it('keeps dev packs and dev channels private to the Developers group', async () => {
    const pack = await createPack('dev');
    const zip = join(server.dir, 'pack.mrpack');
    await modrinthPack(zip, {});
    const release = await publishRelease(pack, zip);
    await server.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/packs/${pack.id}/channels/stable`,
      headers: { cookie },
      payload: { releaseId: release.id },
    });

    expect((await server.app.inject({ url: '/api/v1/packs' })).json()).toEqual([]);
    expect((await server.app.inject({ url: `/api/v1/packs/${pack.slug}/channels/stable/manifest` })).statusCode).toBe(404);

    const outsider = await playerToken('Steve', '1'.repeat(32));
    expect(
      (await server.app.inject({ url: '/api/v1/packs', headers: { authorization: `Bearer ${outsider}` } })).json(),
    ).toEqual([]);

    server.accounts.set('alex', { id: '2'.repeat(32), name: 'Alex' });
    const added = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/developers',
      headers: { cookie },
      payload: { username: 'alex' },
    });
    expect(added.json()).toMatchObject({ uuid: '2'.repeat(32), username: 'Alex' });

    const dev = await playerToken('Alex', '2'.repeat(32));
    const visible: PublicPack[] = (
      await server.app.inject({ url: '/api/v1/packs', headers: { authorization: `Bearer ${dev}` } })
    ).json();
    expect(visible.map((p) => p.id)).toEqual([pack.id]);

    const unknown = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/developers',
      headers: { cookie },
      payload: { username: 'nobody' },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('rejects player tokens that were tampered with', async () => {
    const token = await playerToken('Steve', '1'.repeat(32));
    const [body, sig] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, 'base64url').toString()), uuid: '2'.repeat(32) }),
    ).toString('base64url');
    const res = await server.app.inject({ url: '/api/v1/packs', headers: { authorization: `Bearer ${forged}.${sig}` } });
    expect(res.statusCode).toBe(401);
  });

  it('only accepts each sign-in challenge once', async () => {
    server.joined.set('Steve', { id: '1'.repeat(32), name: 'Steve' });
    const { serverId } = (await server.app.inject({ method: 'POST', url: '/api/v1/auth/challenge' })).json();
    const verify = () =>
      server.app.inject({ method: 'POST', url: '/api/v1/auth/verify', payload: { username: 'Steve', serverId } });
    expect((await verify()).statusCode).toBe(200);
    expect((await verify()).statusCode).toBe(401);
  });
});

describe('CurseForge packs without a download URL', () => {
  const optOutJar = Buffer.from('the real opted-out jar');

  beforeEach(async () => {
    await server.close();
    server = await createTestServer(
      fakeCurseForge([
        {
          id: 200,
          modId: 2,
          fileName: 'optout.jar',
          fileLength: optOutJar.length,
          downloadUrl: null,
          sha1: sha1(optOutJar),
          allowModDistribution: false,
        },
      ]),
    );
    cookie = await setup();
    await server.app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie },
      payload: { curseforgeApiKey: 'test-key' },
    });
  });

  it('builds the download URL and publishes without a manual upload', async () => {
    const pack = await createPack();
    const zip = join(server.dir, 'cf.zip');
    await writeZip(zip, { 'manifest.json': curseforgeManifest([{ projectID: 2, fileID: 200 }]) });
    const release = await publishRelease(pack, zip);
    expect(release.status).toBe('ready');
    expect(release.missing).toEqual([]);

    const promote = await server.app.inject({
      method: 'PUT',
      url: `/api/v1/admin/packs/${pack.id}/channels/stable`,
      headers: { cookie },
      payload: { releaseId: release.id },
    });
    expect(promote.statusCode).toBe(200);

    const manifest: Manifest = (
      await server.app.inject({ url: `/api/v1/packs/${pack.slug}/channels/stable/manifest` })
    ).json();
    expect(manifest.files).toEqual([
      expect.objectContaining({
        path: 'mods/optout.jar',
        source: { type: 'url', url: 'https://www.curseforge.com/api/v1/mods/2/files/200/download/' },
      }),
    ]);
  });

  it('checks a manually uploaded file against the hash the pack expects', async () => {
    const pack = await createPack();
    const zip = join(server.dir, 'cf.zip');
    await writeZip(zip, { 'manifest.json': curseforgeManifest([{ projectID: 2, fileID: 200 }]) });
    const release = await publishRelease(pack, zip);
    const row = server.ctx.db.select().from(releases).where(eq(releases.id, release.id)).get();
    server.ctx.db
      .update(releases)
      .set({
        status: 'needs_files',
        missing: [
          {
            path: 'mods/optout.jar',
            fileName: 'optout.jar',
            size: optOutJar.length,
            sha1: sha1(optOutJar),
            projectName: 'Mod 2',
            pageUrl: null,
          },
        ],
        manifest: { ...row!.manifest!, files: [] },
        fileCount: 0,
        sizeBytes: 0,
      })
      .where(eq(releases.id, release.id))
      .run();

    const resolve = async (data: Buffer) =>
      server.app.inject({
        method: 'POST',
        url: `/api/v1/admin/releases/${release.id}/missing`,
        headers: { cookie },
        payload: { path: 'mods/optout.jar', uploadId: await uploadFile(server.app, cookie, 'optout.jar', data) },
      });

    expect((await resolve(Buffer.from('some other jar'))).statusCode).toBe(400);
    const fixed = await resolve(optOutJar);
    expect(fixed.json()).toMatchObject({ status: 'ready', missing: [], fileCount: 1 });

    const settings = (await server.app.inject({ url: '/api/v1/admin/settings', headers: { cookie } })).json();
    expect(settings).toEqual({
      communityName: 'Migos',
      publicUrl: '',
      hasCurseforgeApiKey: true,
      launcherLogo: null,
      launcherBackground: null,
    });
  });
});

describe('reports', () => {
  beforeEach(async () => {
    cookie = await setup();
  });

  it('stores a bug report and lets an admin read and delete it', async () => {
    const created = await server.app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      payload: {
        kind: 'bug',
        message: 'The play button did nothing',
        sessionLog: 'opened',
        launcherVersion: '5.0.0',
        packSlug: 'migos',
        packName: 'Migos',
      },
    });
    expect(created.statusCode).toBe(200);
    const { id } = created.json();

    const list = await server.app.inject({ method: 'GET', url: '/api/v1/admin/reports', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject([
      { id, kind: 'bug', message: 'The play button did nothing', packName: 'Migos', playerName: null },
    ]);

    const detail = await server.app.inject({ method: 'GET', url: `/api/v1/admin/reports/${id}`, headers: { cookie } });
    expect(detail.json()).toMatchObject({ sessionLog: 'opened', gameLog: null });

    expect((await server.app.inject({ method: 'GET', url: '/api/v1/admin/reports' })).statusCode).toBe(401);

    const empty = await server.app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      payload: { kind: 'bug', message: '   ', sessionLog: 'x', launcherVersion: '5.0.0' },
    });
    expect(empty.statusCode).toBe(400);

    const deleted = await server.app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/reports/${id}`,
      headers: { cookie },
    });
    expect(deleted.statusCode).toBe(200);
    expect((await server.app.inject({ method: 'GET', url: '/api/v1/admin/reports', headers: { cookie } })).json()).toEqual([]);
  });
});
