import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';

export async function writeZip(path: string, entries: Record<string, string | Buffer>): Promise<void> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(entries)) {
    zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  }
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(path));
}

export const sha1 = (data: string | Buffer) => createHash('sha1').update(data).digest('hex');
export const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function curseforgeManifest(files: { projectID: number; fileID: number; required?: boolean }[]) {
  return JSON.stringify({
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name: 'Test Pack',
    version: '1.0.0',
    minecraft: { version: '1.20.1', modLoaders: [{ id: 'forge-47.2.0', primary: true }] },
    files: files.map((f) => ({ required: true, ...f })),
    overrides: 'overrides',
  });
}

interface FakeCfFile {
  id: number;
  modId: number;
  fileName: string;
  fileLength: number;
  downloadUrl: string | null;
  sha1?: string;
  classId?: number;
  allowModDistribution?: boolean;
}

/** A fetch stand-in for the two CurseForge endpoints the importer calls. */
export function fakeCurseForge(files: FakeCfFile[], options: { rejectKey?: boolean } = {}): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (options.rejectKey) return new Response('{}', { status: 403 });
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (url.endsWith('/v1/mods/files')) {
      const data = files
        .filter((f) => body.fileIds.includes(f.id))
        .map((f) => ({
          id: f.id,
          modId: f.modId,
          fileName: f.fileName,
          fileLength: f.fileLength,
          downloadUrl: f.downloadUrl,
          hashes: f.sha1 ? [{ value: f.sha1, algo: 1 }] : [],
        }));
      return Response.json({ data });
    }
    if (url.endsWith('/v1/mods')) {
      const data = files
        .filter((f) => body.modIds.includes(f.modId))
        .map((f) => ({
          id: f.modId,
          name: `Mod ${f.modId}`,
          classId: f.classId ?? 6,
          allowModDistribution: f.allowModDistribution ?? true,
          links: { websiteUrl: `https://www.curseforge.com/minecraft/mc-mods/mod-${f.modId}` },
        }));
      return Response.json({ data });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
