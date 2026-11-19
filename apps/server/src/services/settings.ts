import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { settings } from '../db/schema';
import { newToken } from '../lib/ids';

interface SettingsShape {
  communityName: string;
  publicUrl: string;
  curseforgeApiKey: string;
  launcherLogo: string | null;
  launcherBackground: string | null;
  playerTokenSecret: string;
  /** One-time code required to finish first-run setup. Empty once an owner exists. */
  setupCode: string;
}

const DEFAULTS: Omit<SettingsShape, 'playerTokenSecret'> = {
  communityName: 'My Community',
  publicUrl: '',
  curseforgeApiKey: '',
  launcherLogo: null,
  launcherBackground: null,
  setupCode: '',
};

export class SettingsService {
  constructor(private readonly db: Db) {}

  get<K extends keyof SettingsShape>(key: K): SettingsShape[K] {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (row) return JSON.parse(row.value) as SettingsShape[K];
    if (key === 'playerTokenSecret') {
      const secret = newToken();
      this.set('playerTokenSecret', secret);
      return secret as SettingsShape[K];
    }
    return DEFAULTS[key as keyof typeof DEFAULTS] as SettingsShape[K];
  }

  set<K extends keyof SettingsShape>(key: K, value: SettingsShape[K]): void {
    const json = JSON.stringify(value);
    this.db
      .insert(settings)
      .values({ key, value: json })
      .onConflictDoUpdate({ target: settings.key, set: { value: json } })
      .run();
  }
}
