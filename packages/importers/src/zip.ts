import type { Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';

export class ZipReader {
  private constructor(
    private readonly zip: ZipFile,
    readonly entries: Entry[],
  ) {}

  static async open(path: string): Promise<ZipReader> {
    const zip = await new Promise<ZipFile>((resolve, reject) =>
      yauzl.open(path, { lazyEntries: true, autoClose: false }, (err, zipfile) =>
        err || !zipfile ? reject(err ?? new Error('Could not open zip')) : resolve(zipfile),
      ),
    );
    const entries: Entry[] = [];
    try {
      await new Promise<void>((resolve, reject) => {
        zip.on('entry', (entry: Entry) => {
          entries.push(entry);
          zip.readEntry();
        });
        zip.on('end', resolve);
        zip.on('error', reject);
        zip.readEntry();
      });
    } catch (err) {
      zip.close();
      throw err;
    }
    return new ZipReader(zip, entries);
  }

  find(fileName: string): Entry | undefined {
    return this.entries.find((e) => e.fileName === fileName);
  }

  /** Non-directory entries under `prefix/`, with the prefix stripped. */
  filesUnder(prefix: string): { entry: Entry; path: string }[] {
    const start = `${prefix}/`;
    return this.entries
      .filter((e) => e.fileName.startsWith(start) && !e.fileName.endsWith('/'))
      .map((entry) => ({ entry, path: entry.fileName.slice(start.length) }));
  }

  openStream(entry: Entry): Promise<Readable> {
    return new Promise((resolve, reject) =>
      this.zip.openReadStream(entry, (err, stream) =>
        err || !stream ? reject(err ?? new Error('Could not read zip entry')) : resolve(stream),
      ),
    );
  }

  async readText(entry: Entry, maxBytes = 50 * 1024 * 1024): Promise<string> {
    if (entry.uncompressedSize > maxBytes) {
      throw new Error(`${entry.fileName} is too large`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of await this.openStream(entry)) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  close(): void {
    this.zip.close();
  }
}
