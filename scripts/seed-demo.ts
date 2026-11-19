/**
 * Fills a running dev server with demo data so the panel has something to show.
 *   npm run seed -- http://localhost:8080 <username> <password>
 */
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeZip } from '../packages/importers/test/fixtures';

const [base = 'http://localhost:8080', username = 'admin', password = ''] = process.argv.slice(2);
let cookie = '';

async function call<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const raw = Buffer.isBuffer(body);
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { cookie, ...(body !== undefined && !raw ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : raw ? new Uint8Array(body) : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0]!;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function upload(name: string, data: Buffer): Promise<string> {
  const session = await call<{ id: string; chunkSize: number }>('POST', '/admin/uploads', { filename: name, size: data.length });
  for (let offset = 0; offset < data.length; offset += session.chunkSize) {
    await call('PUT', `/admin/uploads/${session.id}`, data.subarray(offset, offset + session.chunkSize), {
      'content-type': 'application/octet-stream',
      'upload-offset': String(offset),
    });
  }
  return session.id;
}

const image = async (path: string, kind: string) =>
  (await call<{ sha256: string }>('POST', `/admin/media?kind=${kind}`, await readFile(path), { 'content-type': 'application/octet-stream' })).sha256;

await call('POST', '/admin/login', { username, password });

const publicDir = join(import.meta.dirname, '../apps/panel/public');
const background = await image(join(publicDir, 'mmd_bg.png'), 'background');
const thumbnail = await image(join(publicDir, 'web-app-manifest-512x512.png'), 'thumbnail');
await image(join(publicDir, 'mmd_bg.png'), 'screenshot');

const pack = await call<{ id: string }>('POST', '/admin/packs', {
  name: 'Migos SMP',
  status: 'released',
  thumbnail,
  banner: null,
  background,
});
await call('POST', '/admin/packs', { name: 'Testing Grounds', status: 'dev', thumbnail: null, banner: null, background: null });

// A real mod, so the launcher can install and run the demo pack.
const sodiumVersions = (await (
  await fetch(
    'https://api.modrinth.com/v2/project/sodium/version?game_versions=%5B%221.21.1%22%5D&loaders=%5B%22fabric%22%5D',
  )
).json()) as { files: { url: string; filename: string; size: number; primary: boolean; hashes: { sha1: string; sha512: string } }[] }[];
const sodium = sodiumVersions[0]!.files.find((f) => f.primary) ?? sodiumVersions[0]!.files[0]!;

const zipPath = join(tmpdir(), 'demo.mrpack');
await writeZip(zipPath, {
  'modrinth.index.json': JSON.stringify({
    formatVersion: 1,
    game: 'minecraft',
    versionId: '1.0.0',
    name: 'Demo',
    files: [
      {
        path: `mods/${sodium.filename}`,
        hashes: sodium.hashes,
        downloads: [sodium.url],
        fileSize: sodium.size,
      },
    ],
    dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
  }),
  'overrides/config/demo.json': '{"hello":"world"}',
});

for (const [name, html] of [
  ['v1.0.0', '<h1>Launch!</h1><p>The first release of the pack.</p>'],
  ['v1.1.0', '<h2>Changes</h2><ul><li>Added Sodium</li><li>Tweaked configs</li></ul>'],
] as const) {
  const release = await call<{ id: string }>('POST', `/admin/packs/${pack.id}/releases`, {
    uploadId: await upload('demo.mrpack', await readFile(zipPath)),
    name,
    displayDate: 'October 26, 2026',
    changelogHtml: html,
  });
  for (let i = 0; i < 50; i++) {
    const r = await call<{ status: string }>('GET', `/admin/releases/${release.id}`);
    if (r.status !== 'importing') break;
    await new Promise((res) => setTimeout(res, 200));
  }
  await call('PUT', `/admin/packs/${pack.id}/channels/stable`, { releaseId: release.id });
}

console.log('Seeded demo data');
