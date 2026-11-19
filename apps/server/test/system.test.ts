import { API_VERSION, API_VERSION_HEADER, type ServerHealth } from '@mmp/schema';
import { afterEach, describe, expect, it } from 'vitest';
import { currentSetupCode } from '../src/services/setup';
import { UpdateChecker, compareVersions } from '../src/services/updates';
import { createTestServer, sessionCookie, type TestServer } from './helpers';

const feed = (releases: object[]) =>
  (async () => new Response(JSON.stringify(releases), { status: 200 })) as unknown as typeof fetch;

describe('update checks', () => {
  it('orders versions like semver', () => {
    expect(compareVersions('5.0.1', '5.0.0')).toBeGreaterThan(0);
    expect(compareVersions('5.0.0', '5.0.0-alpha.3')).toBeGreaterThan(0);
    expect(compareVersions('5.0.0-alpha.10', '5.0.0-alpha.9')).toBeGreaterThan(0);
    expect(compareVersions('5.0.0-beta.1', '5.0.0-alpha.9')).toBeGreaterThan(0);
    expect(compareVersions('5.10.0', '5.9.9')).toBeGreaterThan(0);
  });

  it('only counts server releases, and pre-releases only for pre-release servers', async () => {
    const releases = [
      { tag_name: 'schema-v9.0.0', html_url: 'l', draft: false, prerelease: false },
      { tag_name: 'v5.1.0-beta.1', html_url: 'beta', draft: false, prerelease: true },
      { tag_name: 'v5.0.2', html_url: 'stable', draft: false, prerelease: false },
      { tag_name: 'v6.0.0', html_url: 'draft', draft: true, prerelease: false },
    ];
    const stable = await new UpdateChecker('5.0.0', 'feed', feed(releases)).status();
    expect(stable).toMatchObject({ latest: '5.0.2', updateAvailable: true, releaseUrl: 'stable', error: null });

    const alpha = await new UpdateChecker('5.1.0-alpha.0', 'feed', feed(releases)).status();
    expect(alpha).toMatchObject({ latest: '5.1.0-beta.1', updateAvailable: true });

    const current = await new UpdateChecker('5.0.2', 'feed', feed(releases)).status();
    expect(current.updateAvailable).toBe(false);
  });

  it('reports a failed check instead of throwing', async () => {
    const down = (async () => new Response('', { status: 503 })) as unknown as typeof fetch;
    const status = await new UpdateChecker('5.0.0', 'feed', down).status();
    expect(status.updateAvailable).toBe(false);
    expect(status.error).toContain('503');
  });
});

describe('system routes', () => {
  let server: TestServer;
  afterEach(() => server.close());

  it('sends the API version on API responses, including errors', async () => {
    server = await createTestServer();
    const ok = await server.app.inject({ url: '/api/v1/launcher/config' });
    expect(ok.headers[API_VERSION_HEADER]).toBe(String(API_VERSION));
    const missing = await server.app.inject({ url: '/api/v1/packs/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers[API_VERSION_HEADER]).toBe(String(API_VERSION));
  });

  it('serves an escaped join page with a connect link', async () => {
    server = await createTestServer();
    server.ctx.settings.set('communityName', '<script>x</script>');
    server.ctx.settings.set('publicUrl', 'https://packs.example.com');
    const res = await server.app.inject({ url: '/join' });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('<script>x');
    expect(res.body).toContain('&lt;script&gt;');
    expect(res.body).toContain('mml://connect?server=https%3A%2F%2Fpacks.example.com');
  });

  it('runs health checks for admins only', async () => {
    const offline = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    server = await createTestServer(offline);
    expect((await server.app.inject({ url: '/api/v1/admin/system/health' })).statusCode).toBe(401);

    const setup = await server.app.inject({
      method: 'POST',
      url: '/api/v1/admin/setup',
      payload: { code: currentSetupCode(server.ctx.settings), username: 'owner', password: 'correct horse battery', communityName: 'M' },
    });
    const cookie = sessionCookie(setup);
    const health = (await server.app.inject({ url: '/api/v1/admin/system/health', headers: { cookie } })).json() as ServerHealth;
    const byId = Object.fromEntries(health.checks.map((c) => [c.id, c.level]));
    expect(health.version).toBe('5.0.0');
    expect(byId).toMatchObject({ database: 'ok', 'public-url': 'error', modrinth: 'error', curseforge: 'off' });

    const update = await server.app.inject({ url: '/api/v1/admin/system/update', headers: { cookie } });
    expect(update.json()).toMatchObject({ current: '5.0.0', updateAvailable: false });
  });
});
