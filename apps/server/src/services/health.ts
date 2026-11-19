import { statfs } from 'node:fs/promises';
import type { HealthCheck, ServerHealth } from '@mmp/schema';
import { sql } from 'drizzle-orm';
import type { AppContext } from '../context';

const TIMEOUT_MS = 6000;
const LOW_DISK_BYTES = 5 * 1024 ** 3;
const VERY_LOW_DISK_BYTES = 1024 ** 3;

type Check = Omit<HealthCheck, 'id' | 'label'>;

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

const isLocalHost = (host: string) =>
  host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]' ||
  /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host);

async function run(id: string, label: string, check: () => Promise<Check>): Promise<HealthCheck> {
  try {
    return { id, label, ...(await check()) };
  } catch (err) {
    const message = err instanceof Error ? (err.name === 'TimeoutError' ? 'Timed out' : err.message) : String(err);
    return { id, label, level: 'error', message };
  }
}

/** Everything a creator would otherwise have to debug by hand when players can't connect. */
export async function serverHealth(ctx: AppContext, instanceId: string): Promise<ServerHealth> {
  const { config, settings, db } = ctx;
  const get = (url: string, headers: Record<string, string> = {}) =>
    ctx.fetch(url, { headers: { 'user-agent': `mmp/${config.version}`, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });

  const checks = await Promise.all([
    run('database', 'Database', async () => {
      db.run(sql`select 1`);
      return { level: 'ok', message: 'Reading and writing normally' };
    }),

    run('disk', 'Disk space', async () => {
      const stats = await statfs(config.dataDir);
      const free = stats.bavail * stats.bsize;
      if (free < VERY_LOW_DISK_BYTES) return { level: 'error', message: `Only ${gb(free)} free. Uploads will start failing.` };
      if (free < LOW_DISK_BYTES) return { level: 'warn', message: `${gb(free)} free. Packs need room for uploads and imports.` };
      return { level: 'ok', message: `${gb(free)} free` };
    }),

    run('public-url', 'Public URL', async () => {
      const publicUrl = settings.get('publicUrl');
      if (!publicUrl) return { level: 'error', message: 'Not set. Players need it to add your server in the launcher.' };
      const url = new URL(publicUrl);
      const res = await get(`${publicUrl}/healthz`);
      const body = (await res.json().catch(() => null)) as { instance?: string } | null;
      if (!res.ok || body?.instance === undefined) {
        return { level: 'error', message: `${url.host} answered, but not as this server (status ${res.status}). Check your proxy or DNS.` };
      }
      if (body.instance !== instanceId) {
        return { level: 'error', message: `${url.host} points at a different MMP server.` };
      }
      if (url.protocol !== 'https:' && !isLocalHost(url.hostname)) {
        return { level: 'warn', message: 'Reachable, but over plain HTTP. Put HTTPS in front so sign-ins are protected.' };
      }
      if (isLocalHost(url.hostname)) {
        return { level: 'warn', message: 'Points at this machine or your local network, so players outside it can\'t connect.' };
      }
      return { level: 'ok', message: `Reachable at ${url.host}` };
    }),

    run('https', 'Secure cookies', async () => {
      const publicUrl = settings.get('publicUrl');
      const https = publicUrl.startsWith('https://');
      if (https && !config.secureCookies) return { level: 'warn', message: 'Served over HTTPS, but SECURE_COOKIES isn\'t set to true.' };
      if (!https && config.secureCookies) return { level: 'warn', message: 'SECURE_COOKIES is on, but the public URL isn\'t HTTPS, so sign-in won\'t stick.' };
      return { level: 'ok', message: https ? 'On' : 'Off (no HTTPS)' };
    }),

    run('mojang', 'Minecraft sign-in', async () => {
      const res = await get('https://sessionserver.mojang.com/session/minecraft/profile/069a79f444e94726a5befca90e38aaf5');
      if (res.status >= 500) return { level: 'error', message: `Mojang's session server answered ${res.status}. DEV Access sign-ins will fail.` };
      return { level: 'ok', message: "Mojang's session server is reachable" };
    }),

    run('modrinth', 'Modrinth', async () => {
      const res = await get('https://api.modrinth.com/v2/tag/loader');
      if (!res.ok) return { level: 'warn', message: `Modrinth answered ${res.status}. Modrinth imports may fail.` };
      return { level: 'ok', message: 'Reachable' };
    }),

    run('curseforge', 'CurseForge', async () => {
      const key = settings.get('curseforgeApiKey');
      if (!key) return { level: 'off', message: 'No API key. Only needed to import CurseForge exports.' };
      const res = await get('https://api.curseforge.com/v1/games/432', { 'x-api-key': key });
      if (res.status === 401 || res.status === 403) return { level: 'error', message: 'The saved API key was rejected.' };
      if (!res.ok) return { level: 'warn', message: `CurseForge answered ${res.status}.` };
      return { level: 'ok', message: 'API key works' };
    }),
  ]);

  return { version: config.version, checks };
}
