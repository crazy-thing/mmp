import { importCurseForge } from './curseforge';
import { importModrinth } from './modrinth';
import { ImportError, type ImportContext, type ImportResult } from './types';
import { ZipReader } from './zip';

export { parseCurseForgeLoader } from './curseforge';
export { parseModrinthLoader } from './modrinth';
export * from './types';
export { ZipReader } from './zip';

/** Detects the pack format and builds the manifest file list. */
export async function importPackZip(zipPath: string, ctx: ImportContext): Promise<ImportResult> {
  let zip: ZipReader;
  try {
    zip = await ZipReader.open(zipPath);
  } catch {
    throw new ImportError('The upload is not a valid zip file');
  }
  try {
    if (zip.find('modrinth.index.json')) return await importModrinth(zip, ctx);
    if (zip.find('manifest.json')) return await importCurseForge(zip, ctx);
    throw new ImportError(
      'Unrecognised pack. Upload a CurseForge export (.zip with manifest.json) or a Modrinth pack (.mrpack).',
    );
  } finally {
    zip.close();
  }
}
