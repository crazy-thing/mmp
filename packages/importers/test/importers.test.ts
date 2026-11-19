import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImportError, importPackZip, parseCurseForgeLoader, parseModrinthLoader, type ImportContext } from '../src';
import { curseforgeManifest, fakeCurseForge, sha1, sha256, writeZip } from './fixtures';

let dir: string;
let stored: Map<string, Buffer>;

const ctx = (extra: Partial<ImportContext> = {}): ImportContext => ({
  putBlob: async (stream: Readable) => {
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(c as Buffer);
    const buf = Buffer.concat(chunks);
    stored.set(sha256(buf), buf);
    return { sha256: sha256(buf), sha1: sha1(buf), size: buf.length };
  },
  ...extra,
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mmp-import-'));
  stored = new Map();
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe('loader parsing', () => {
  it.each([
    [[{ id: 'forge-47.2.0', primary: true }], { type: 'forge', version: '47.2.0' }],
    [[{ id: 'neoforge-20.4.80-beta', primary: true }], { type: 'neoforge', version: '20.4.80-beta' }],
    [[{ id: 'fabric-0.15.11' }], { type: 'fabric', version: '0.15.11' }],
    [[], { type: 'vanilla' }],
  ])('CurseForge %j', (modLoaders, expected) => {
    expect(parseCurseForgeLoader({ version: '1.20.1', modLoaders })).toEqual(expected);
  });

  it('rejects unknown CurseForge loaders', () => {
    expect(() => parseCurseForgeLoader({ version: '1.20.1', modLoaders: [{ id: 'rift-1.0' }] })).toThrow(ImportError);
  });

  it('reads Modrinth dependencies', () => {
    expect(parseModrinthLoader({ minecraft: '1.21', 'fabric-loader': '0.16.0' })).toEqual({ type: 'fabric', version: '0.16.0' });
    expect(parseModrinthLoader({ minecraft: '1.21', neoforge: '21.0.1' })).toEqual({ type: 'neoforge', version: '21.0.1' });
    expect(parseModrinthLoader({ minecraft: '1.21' })).toEqual({ type: 'vanilla' });
  });
});

describe('CurseForge import', () => {
  const jar = 'a'.repeat(40);

  it('resolves CDN URLs, stores overrides, and builds a download URL when CurseForge omits one', async () => {
    const zip = join(dir, 'pack.zip');
    await writeZip(zip, {
      'manifest.json': curseforgeManifest([
        { projectID: 1, fileID: 100 },
        { projectID: 2, fileID: 200 },
        { projectID: 3, fileID: 300 },
        { projectID: 4, fileID: 400, required: false },
      ]),
      'overrides/config/foo.toml': 'a = 1',
      'overrides/options.txt': 'fov:90',
    });

    const result = await importPackZip(
      zip,
      ctx({
        curseforgeApiKey: 'key',
        fetch: fakeCurseForge([
          { id: 100, modId: 1, fileName: 'jei.jar', fileLength: 10, downloadUrl: 'https://edge.forgecdn.net/files/0/100/jei.jar', sha1: jar },
          { id: 200, modId: 2, fileName: 'optout.jar', fileLength: 20, downloadUrl: null, sha1: 'b'.repeat(40), allowModDistribution: false },
          { id: 300, modId: 3, fileName: 'faithful.zip', fileLength: 30, downloadUrl: 'https://edge.forgecdn.net/files/0/300/faithful.zip', sha1: 'c'.repeat(40), classId: 12 },
        ]),
      }),
    );

    expect(result.format).toBe('curseforge');
    expect(result.minecraft).toBe('1.20.1');
    expect(result.loader).toEqual({ type: 'forge', version: '47.2.0' });

    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath['mods/jei.jar']).toMatchObject({
      source: { type: 'url', url: 'https://edge.forgecdn.net/files/0/100/jei.jar' },
      hashes: { sha1: jar },
    });
    expect(byPath['resourcepacks/faithful.zip']).toBeDefined();
    expect(byPath['config/foo.toml']).toMatchObject({ source: { type: 'blob' }, hashes: { sha256: sha256('a = 1') }, policy: 'overwrite' });
    expect(byPath['options.txt']).toMatchObject({ policy: 'default' });
    expect(byPath['mods/optout.jar']).toMatchObject({
      source: { type: 'url', url: 'https://www.curseforge.com/api/v1/mods/2/files/200/download/' },
      hashes: { sha1: 'b'.repeat(40) },
    });
    expect(result.missing).toEqual([]);
    expect(stored.size).toBe(2);
  });

  it('asks for an API key when the pack references CurseForge files', async () => {
    const zip = join(dir, 'pack.zip');
    await writeZip(zip, { 'manifest.json': curseforgeManifest([{ projectID: 1, fileID: 100 }]) });
    await expect(importPackZip(zip, ctx())).rejects.toThrow(/CurseForge API key/);
  });

  it('reports a rejected key clearly', async () => {
    const zip = join(dir, 'pack.zip');
    await writeZip(zip, { 'manifest.json': curseforgeManifest([{ projectID: 1, fileID: 100 }]) });
    await expect(
      importPackZip(zip, ctx({ curseforgeApiKey: 'bad', fetch: fakeCurseForge([], { rejectKey: true }) })),
    ).rejects.toThrow(/rejected the API key/);
  });

  it('works without a key when the pack is overrides only', async () => {
    const zip = join(dir, 'pack.zip');
    await writeZip(zip, { 'manifest.json': curseforgeManifest([]), 'overrides/mods/own.jar': 'jar' });
    const result = await importPackZip(zip, ctx());
    expect(result.files.map((f) => f.path)).toEqual(['mods/own.jar']);
  });
});

describe('Modrinth import', () => {
  const index = (files: unknown[]) =>
    JSON.stringify({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.0.0',
      name: 'Test',
      files,
      dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
    });

  it('maps files, skips server-only ones and lets client-overrides win', async () => {
    const zip = join(dir, 'pack.mrpack');
    await writeZip(zip, {
      'modrinth.index.json': index([
        { path: 'mods/sodium.jar', hashes: { sha1: 'A'.repeat(40), sha512: 'b'.repeat(128) }, env: { client: 'required', server: 'unsupported' }, downloads: ['https://cdn.modrinth.com/sodium.jar'], fileSize: 5 },
        { path: 'mods/server-only.jar', hashes: { sha1: 'c'.repeat(40) }, env: { client: 'unsupported', server: 'required' }, downloads: ['https://cdn.modrinth.com/s.jar'], fileSize: 5 },
      ]),
      'overrides/config/a.json': 'server',
      'client-overrides/config/a.json': 'client',
    });

    const result = await importPackZip(zip, ctx());
    expect(result.loader).toEqual({ type: 'fabric', version: '0.16.5' });
    const byPath = Object.fromEntries(result.files.map((f) => [f.path, f]));
    expect(byPath['mods/sodium.jar']?.hashes.sha1).toBe('a'.repeat(40));
    expect(byPath['mods/server-only.jar']).toBeUndefined();
    expect(byPath['config/a.json']?.hashes.sha256).toBe(sha256('client'));
  });

  it('rejects paths that escape the instance folder', async () => {
    const zip = join(dir, 'pack.mrpack');
    await writeZip(zip, {
      'modrinth.index.json': index([
        { path: '../../evil.jar', hashes: { sha1: 'a'.repeat(40) }, downloads: ['https://cdn.modrinth.com/e.jar'], fileSize: 1 },
      ]),
    });
    await expect(importPackZip(zip, ctx())).rejects.toThrow(/Unsafe path/);
  });

  it('rejects non-HTTPS downloads', async () => {
    const zip = join(dir, 'pack.mrpack');
    await writeZip(zip, {
      'modrinth.index.json': index([
        { path: 'mods/x.jar', hashes: { sha1: 'a'.repeat(40) }, downloads: ['http://example.com/x.jar'], fileSize: 1 },
      ]),
    });
    await expect(importPackZip(zip, ctx())).rejects.toThrow(/HTTPS/);
  });
});

it('rejects zips that are not packs', async () => {
  const zip = join(dir, 'random.zip');
  await writeZip(zip, { 'readme.txt': 'hi' });
  await expect(importPackZip(zip, ctx())).rejects.toThrow(/Unrecognised pack/);
});

it('rejects files that are not zips', async () => {
  const { writeFile } = await import('node:fs/promises');
  const path = join(dir, 'not.zip');
  await writeFile(path, 'definitely not a zip');
  await expect(importPackZip(path, ctx())).rejects.toThrow(/not a valid zip/);
});
