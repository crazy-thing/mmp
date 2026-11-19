import { isSafeRelativePath, type Loader, type ManifestFile } from '@mmp/schema';
import { z } from 'zod';
import { importOverrides } from './overrides';
import { ImportError, type ImportContext, type ImportResult } from './types';
import type { ZipReader } from './zip';

const indexSchema = z.object({
  formatVersion: z.literal(1),
  game: z.literal('minecraft'),
  files: z.array(
    z.object({
      path: z.string(),
      hashes: z.object({ sha1: z.string(), sha512: z.string().optional() }),
      env: z.object({ client: z.string().optional() }).optional(),
      downloads: z.array(z.string()).min(1),
      fileSize: z.number().int().nonnegative(),
    }),
  ),
  dependencies: z.record(z.string(), z.string()),
});

const LOADER_KEYS: [string, Loader['type']][] = [
  ['neoforge', 'neoforge'],
  ['forge', 'forge'],
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
];

export function parseModrinthLoader(dependencies: Record<string, string>): Loader {
  for (const [key, type] of LOADER_KEYS) {
    const version = dependencies[key];
    if (version) return { type, version };
  }
  return { type: 'vanilla' };
}

export async function importModrinth(zip: ZipReader, ctx: ImportContext): Promise<ImportResult> {
  const entry = zip.find('modrinth.index.json');
  if (!entry) throw new ImportError('modrinth.index.json not found');

  let raw: unknown;
  try {
    raw = JSON.parse(await zip.readText(entry));
  } catch {
    throw new ImportError('modrinth.index.json is not valid JSON');
  }
  const parsed = indexSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError('modrinth.index.json is not a valid Modrinth pack index');
  const index = parsed.data;

  const minecraft = index.dependencies.minecraft;
  if (!minecraft) throw new ImportError('The Modrinth pack does not declare a Minecraft version');

  const files = new Map<string, ManifestFile>();
  for (const file of index.files) {
    if (file.env?.client === 'unsupported') continue;
    if (!isSafeRelativePath(file.path)) throw new ImportError(`Unsafe path in Modrinth index: ${file.path}`);
    const url = file.downloads.find((u) => u.startsWith('https://'));
    if (!url) throw new ImportError(`${file.path} has no HTTPS download URL`);
    files.set(file.path, {
      path: file.path,
      size: file.fileSize,
      hashes: { sha1: file.hashes.sha1.toLowerCase(), sha512: file.hashes.sha512?.toLowerCase() },
      source: { type: 'url', url },
      policy: 'overwrite',
    });
  }

  await importOverrides(zip, ['overrides', 'client-overrides'], ctx, files, (fraction, message) =>
    ctx.onProgress?.(fraction, message),
  );

  return {
    format: 'modrinth',
    minecraft,
    loader: parseModrinthLoader(index.dependencies),
    files: [...files.values()],
    missing: [],
  };
}
