import type { UpdateStatus } from '@mmp/schema';

const TAG_PREFIX = 'v';
const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

interface GithubRelease {
  tag_name: string;
  html_url: string;
  draft: boolean;
  prerelease: boolean;
}

type Version = { core: number[]; pre: string | null };

function parseVersion(text: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim());
  if (!match) return null;
  return { core: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] ?? null };
}

/** Semver order, including pre-release tags (`5.0.0-alpha.2` < `5.0.0-beta.1` < `5.0.0`). */
export function compareVersions(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  for (let i = 0; i < 3; i++) if (va.core[i] !== vb.core[i]) return va.core[i]! - vb.core[i]!;
  if (va.pre === vb.pre) return 0;
  if (va.pre === null) return 1;
  if (vb.pre === null) return -1;
  const pa = va.pre.split('.');
  const pb = vb.pre.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : null;
    const ny = /^\d+$/.test(y) ? Number(y) : null;
    if (nx !== null && ny !== null && nx !== ny) return nx - ny;
    if (nx !== null && ny === null) return -1;
    if (nx === null && ny !== null) return 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** Checks the release feed at most every few hours. Pre-releases only count when this server runs one. */
export class UpdateChecker {
  private cached: UpdateStatus | null = null;
  private cachedAt = 0;

  constructor(
    private readonly current: string,
    private readonly feed: string | null,
    private readonly fetchFn: typeof fetch,
  ) {}

  async status(refresh = false): Promise<UpdateStatus> {
    if (!this.feed) {
      return { current: this.current, latest: null, updateAvailable: false, releaseUrl: null, checkedAt: null, error: 'Update checks are switched off (UPDATE_FEED is empty).' };
    }
    if (!refresh && this.cached && Date.now() - this.cachedAt < CACHE_MS) return this.cached;
    this.cached = await this.check(this.feed);
    this.cachedAt = Date.now();
    return this.cached;
  }

  private async check(feed: string): Promise<UpdateStatus> {
    const base = { current: this.current, checkedAt: new Date().toISOString() };
    try {
      const res = await this.fetchFn(feed, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': `mmp/${this.current}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`The update feed answered ${res.status}`);
      const releases = (await res.json()) as GithubRelease[];
      const allowPre = parseVersion(this.current)?.pre != null;
      const newest = releases
        .filter((r) => !r.draft && r.tag_name.startsWith(TAG_PREFIX) && (allowPre || !r.prerelease))
        .map((r) => ({ version: r.tag_name.slice(TAG_PREFIX.length), url: r.html_url }))
        .filter((r) => parseVersion(r.version))
        .sort((a, b) => compareVersions(b.version, a.version))[0];
      if (!newest) return { ...base, latest: null, updateAvailable: false, releaseUrl: null, error: 'No server releases published yet.' };
      return {
        ...base,
        latest: newest.version,
        updateAvailable: compareVersions(newest.version, this.current) > 0,
        releaseUrl: newest.url,
        error: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ...base, latest: null, updateAvailable: false, releaseUrl: null, error: `Couldn't check for updates: ${message}` };
    }
  }
}
