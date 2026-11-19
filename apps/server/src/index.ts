import { join } from 'node:path';
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db';
import { createMojangClient } from './lib/mojang';
import { ensureDevelopersGroup } from './routes/admin-groups';
import { collectGarbage } from './services/gc';
import { SettingsService } from './services/settings';
import { needsSetup, publishSetupCode } from './services/setup';
import { pruneStaleUploads } from './services/uploads';
import { createLocalBlobStore } from './storage/blob-store';

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

const config = loadConfig();
const { db, close } = openDatabase(join(config.dataDir, 'mmp.db'));
const tmpDir = join(config.dataDir, 'tmp');
const blobs = createLocalBlobStore(join(config.dataDir, 'blobs'), tmpDir);
const settings = new SettingsService(db);
ensureDevelopersGroup(db);

const { app, ctx } = await buildApp({ config, db, blobs, settings, mojang: createMojangClient(), tmpDir, fetch });
ctx.imports.recoverInterrupted();

const housekeeping = setInterval(() => {
  pruneStaleUploads(db, tmpDir)
    .then(() => collectGarbage(db, blobs, settings))
    .then((removed) => removed > 0 && app.log.info({ removed }, 'removed unused files'))
    .catch((err: unknown) => app.log.error({ err }, 'housekeeping failed'));
}, HOUSEKEEPING_INTERVAL_MS);
housekeeping.unref();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    clearInterval(housekeeping);
    await app.close();
    close();
    process.exit(0);
  });
}

await app.listen({ host: config.host, port: config.port });
app.log.info(`MMP server ${config.version}. Data directory: ${config.dataDir}`);

if (needsSetup(db)) {
  const code = await publishSetupCode(settings, config.dataDir);
  const line = '='.repeat(64);
  // Plain console output so it reads cleanly in `docker logs` and isn't buried in JSON.
  console.log(
    [
      '',
      line,
      '  First-time setup',
      `  Open this server in a browser and enter the setup code: ${code}`,
      `  (also saved in ${join(config.dataDir, 'setup-code.txt')})`,
      line,
      '',
    ].join('\n'),
  );
}
