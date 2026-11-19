import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** GitHub releases of the MMP repo, tagged `v<version>`. */
const DEFAULT_UPDATE_FEED = 'https://api.github.com/repos/crazy-thing/mmp/releases?per_page=50';

/** src/config.ts in development and the bundled dist/index.js both sit one level below package.json. */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface Config {
  host: string;
  port: number;
  dataDir: string;
  /** Built panel to serve at `/`. Null disables it (e.g. when Vite serves the panel in dev). */
  panelDir: string | null;
  /** Set when the server sits behind HTTPS, so session cookies are marked Secure. */
  secureCookies: boolean;
  trustProxy: boolean;
  logLevel: string;
  version: string;
  /** GitHub releases API URL checked for newer server versions. Null switches the check off. */
  updateFeed: string | null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const panelDir = env.PANEL_DIR ?? resolve(import.meta.dirname, '../../panel/dist');
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number(env.PORT ?? 8080),
    dataDir: resolve(env.DATA_DIR ?? './data'),
    panelDir: env.PANEL_DIR === '' ? null : panelDir,
    secureCookies: env.SECURE_COOKIES === 'true',
    trustProxy: env.TRUST_PROXY === 'true',
    logLevel: env.LOG_LEVEL ?? 'info',
    version: readVersion(),
    updateFeed: env.UPDATE_FEED === '' ? null : (env.UPDATE_FEED ?? DEFAULT_UPDATE_FEED),
  };
}
