/**
 * Manifest paths are relative to the instance folder and always use forward slashes.
 * Anything that could escape the instance folder is rejected.
 */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > 512) return false;
  if (path.includes('\\') || path.includes('\0')) return false;
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false;
  return path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

/** Player-owned files that a pack may seed but must never overwrite once they exist. */
const PLAYER_OWNED_FILES = new Set([
  'options.txt',
  'optionsof.txt',
  'optionsshaders.txt',
  'servers.dat',
]);

export function defaultPolicyFor(path: string): 'overwrite' | 'default' {
  return PLAYER_OWNED_FILES.has(path) ? 'default' : 'overwrite';
}
