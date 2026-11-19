import type { StoredBlob } from '@mmp/importers';
import type { Db } from '../db';
import { blobs } from '../db/schema';
import { nowIso } from '../lib/ids';

/** Records a stored blob. Re-storing refreshes its timestamp so GC treats it as new. */
export function recordBlob(db: Db, stored: StoredBlob): void {
  const createdAt = nowIso();
  db.insert(blobs)
    .values({ ...stored, createdAt })
    .onConflictDoUpdate({ target: blobs.sha256, set: { createdAt } })
    .run();
}
