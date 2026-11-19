import type { ChannelName, PackStatus } from '@mmp/schema';
import { isDeveloper, type PlayerIdentity } from './auth';

/**
 * released packs are visible to everyone, dev packs only to the Developers group,
 * and unreleased packs to nobody.
 */
export function canSeePack(status: PackStatus, player: PlayerIdentity | null): boolean {
  if (status === 'released') return true;
  if (status === 'dev') return isDeveloper(player);
  return false;
}

/** The stable channel follows the pack's visibility. Every other channel is Developers-only. */
export function canUseChannel(status: PackStatus, channel: ChannelName, player: PlayerIdentity | null): boolean {
  if (!canSeePack(status, player)) return false;
  return channel === 'stable' || isDeveloper(player);
}
