import { defaultPolicyFor, isSafeRelativePath, type ManifestFile } from '@mmp/schema';
import { ImportError, type ImportContext } from './types';
import type { ZipReader } from './zip';

/**
 * Stores every file under the given zip folders as a blob. Later prefixes win,
 * so pass e.g. ['overrides', 'client-overrides'].
 */
export async function importOverrides(
  zip: ZipReader,
  prefixes: string[],
  ctx: ImportContext,
  into: Map<string, ManifestFile>,
  report: (fraction: number, message: string) => void,
): Promise<void> {
  const entries = prefixes.flatMap((prefix) => zip.filesUnder(prefix));
  const totalBytes = entries.reduce((sum, { entry }) => sum + entry.uncompressedSize, 0) || 1;
  let doneBytes = 0;

  for (const { entry, path } of entries) {
    if (!isSafeRelativePath(path)) {
      throw new ImportError(`The zip contains an unsafe path: ${entry.fileName}`);
    }
    const stored = await ctx.putBlob(await zip.openStream(entry));
    into.set(path, {
      path,
      size: stored.size,
      hashes: { sha1: stored.sha1, sha256: stored.sha256 },
      source: { type: 'blob' },
      policy: defaultPolicyFor(path),
    });
    doneBytes += entry.uncompressedSize;
    report(doneBytes / totalBytes, `Storing ${path}`);
  }
}
