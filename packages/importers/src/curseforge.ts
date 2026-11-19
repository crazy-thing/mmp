import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { isSafeRelativePath, type Loader, type ManifestFile } from '@mmp/schema';
import { z } from 'zod';
import { importOverrides } from './overrides';
import { ImportError, type ImportContext, type ImportResult } from './types';
import type { ZipReader } from './zip';

const CF_API = 'https://api.curseforge.com';
/** Website download route v4 used. It redirects to the file when the API omits downloadUrl. */
const CF_DOWNLOAD = 'https://www.curseforge.com/api/v1/mods';
const BATCH_SIZE = 500;

/** Direct download URL for a CurseForge file, built from the ids in the pack manifest. */
export function curseForgeDownloadUrl(projectId: number, fileId: number): string {
  return `${CF_DOWNLOAD}/${projectId}/files/${fileId}/download/`;
}

const cfManifestSchema = z.object({
  minecraft: z.object({
    version: z.string().min(1),
    modLoaders: z.array(z.object({ id: z.string(), primary: z.boolean().optional() })).default([]),
  }),
  files: z
    .array(
      z.object({
        projectID: z.number().int(),
        fileID: z.number().int(),
        required: z.boolean().default(true),
      }),
    )
    .default([]),
  overrides: z.string().default('overrides'),
});

const cfFileSchema = z.object({
  id: z.number(),
  modId: z.number(),
  fileName: z.string(),
  fileLength: z.number(),
  downloadUrl: z.string().nullable().optional(),
  hashes: z.array(z.object({ value: z.string(), algo: z.number() })).default([]),
});

const cfModSchema = z.object({
  id: z.number(),
  name: z.string(),
  classId: z.number().nullable().optional(),
  allowModDistribution: z.boolean().nullable().optional(),
  links: z.object({ websiteUrl: z.string().nullable().optional() }).optional(),
});

type CfFile = z.infer<typeof cfFileSchema>;
type CfMod = z.infer<typeof cfModSchema>;

/** CurseForge "classId" → folder inside the instance. */
const CLASS_FOLDERS: Record<number, string> = {
  6: 'mods',
  12: 'resourcepacks',
  6552: 'shaderpacks',
};

const SHA1_ALGO = 1;

export function parseCurseForgeLoader(minecraft: z.infer<typeof cfManifestSchema>['minecraft']): Loader {
  const primary = minecraft.modLoaders.find((l) => l.primary) ?? minecraft.modLoaders[0];
  if (!primary) return { type: 'vanilla' };
  const dash = primary.id.indexOf('-');
  const name = dash === -1 ? primary.id : primary.id.slice(0, dash);
  const version = dash === -1 ? undefined : primary.id.slice(dash + 1);
  switch (name) {
    case 'forge':
    case 'neoforge':
    case 'fabric':
    case 'quilt':
      return { type: name, version };
    default:
      throw new ImportError(`Unsupported mod loader "${primary.id}"`);
  }
}

export async function importCurseForge(zip: ZipReader, ctx: ImportContext): Promise<ImportResult> {
  const entry = zip.find('manifest.json');
  if (!entry) throw new ImportError('manifest.json not found');

  let raw: unknown;
  try {
    raw = JSON.parse(await zip.readText(entry));
  } catch {
    throw new ImportError('manifest.json is not valid JSON');
  }
  const parsed = cfManifestSchema.safeParse(raw);
  if (!parsed.success) throw new ImportError('manifest.json is not a CurseForge modpack manifest');
  const manifest = parsed.data;

  const report = (fraction: number, message: string) => ctx.onProgress?.(fraction, message);
  const files = new Map<string, ManifestFile>();
  const wanted = manifest.files.filter((f) => f.required);

  if (wanted.length > 0) {
    if (!ctx.curseforgeApiKey) {
      throw new ImportError('This is a CurseForge pack. Add a CurseForge API key in Settings, then try again.');
    }
    report(0, `Looking up ${wanted.length} files on CurseForge`);
    const api = new CurseForgeApi(ctx.curseforgeApiKey, ctx.fetch ?? fetch);
    const cfFiles = await api.getFiles(wanted.map((f) => f.fileID));
    const cfMods = await api.getMods(wanted.map((f) => f.projectID));

    let done = 0;
    for (const ref of wanted) {
      const file = cfFiles.get(ref.fileID);
      const mod = cfMods.get(ref.projectID);
      if (!file) throw new ImportError(`CurseForge file ${ref.fileID} (project ${ref.projectID}) doesn't exist`);

      const folder = CLASS_FOLDERS[mod?.classId ?? 6] ?? 'mods';
      const path = `${folder}/${file.fileName}`;
      if (!isSafeRelativePath(path)) throw new ImportError(`Unsafe CurseForge file name: ${file.fileName}`);

      const sha1 = file.hashes.find((h) => h.algo === SHA1_ALGO)?.value.toLowerCase();
      const downloadUrl = file.downloadUrl ?? curseForgeDownloadUrl(ref.projectID, file.id);

      if (sha1) {
        files.set(path, {
          path,
          size: file.fileLength,
          hashes: { sha1 },
          source: { type: 'url', url: downloadUrl },
          policy: 'overwrite',
        });
      } else {
        // No published hash: fetch it once here so the launcher can still verify it.
        files.set(path, await mirrorToBlob(path, file, downloadUrl, ctx));
      }
      done += 1;
      report(0.3 * (done / wanted.length), `Resolved ${file.fileName}`);
    }
  }

  await importOverrides(zip, [manifest.overrides], ctx, files, (fraction, message) =>
    report(0.3 + 0.7 * fraction, message),
  );

  return {
    format: 'curseforge',
    minecraft: manifest.minecraft.version,
    loader: parseCurseForgeLoader(manifest.minecraft),
    files: [...files.values()],
    missing: [],
  };
}

async function mirrorToBlob(path: string, file: CfFile, downloadUrl: string, ctx: ImportContext): Promise<ManifestFile> {
  const res = await (ctx.fetch ?? fetch)(downloadUrl);
  if (!res.ok || !res.body) throw new ImportError(`Could not download ${file.fileName} (${res.status})`);
  const stored = await ctx.putBlob(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>));
  return {
    path,
    size: stored.size,
    hashes: { sha1: stored.sha1, sha256: stored.sha256 },
    source: { type: 'blob' },
    policy: 'overwrite',
  };
}

class CurseForgeApi {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch,
  ) {}

  async getFiles(fileIds: number[]): Promise<Map<number, CfFile>> {
    const result = new Map<number, CfFile>();
    for (const batch of chunks(unique(fileIds), BATCH_SIZE)) {
      const data = await this.post('/v1/mods/files', { fileIds: batch });
      for (const item of data) {
        const file = cfFileSchema.parse(item);
        result.set(file.id, file);
      }
    }
    return result;
  }

  async getMods(modIds: number[]): Promise<Map<number, CfMod>> {
    const result = new Map<number, CfMod>();
    for (const batch of chunks(unique(modIds), BATCH_SIZE)) {
      const data = await this.post('/v1/mods', { modIds: batch, filterPcOnly: true });
      for (const item of data) {
        const mod = cfModSchema.parse(item);
        result.set(mod.id, mod);
      }
    }
    return result;
  }

  private async post(path: string, body: unknown): Promise<unknown[]> {
    const res = await this.fetchFn(`${CF_API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': this.apiKey },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ImportError('CurseForge rejected the API key. Check it in Settings.');
    }
    if (!res.ok) throw new ImportError(`CurseForge API error ${res.status} on ${path}`);
    const json = (await res.json()) as { data?: unknown };
    return Array.isArray(json.data) ? json.data : [];
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
