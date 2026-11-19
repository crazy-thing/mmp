/**
 * Where players download the launcher. Null until signed launcher builds are published, which hides
 * the download buttons in the panel and on the /join page. Set it in one place to switch them on.
 */
export const LAUNCHER_DOWNLOADS: { windows: string; mac: string; linux: string } | null = null;

/** The launcher's URL scheme. `mml://connect?server=<url>` opens the launcher and offers to add the server. */
export const LAUNCHER_PROTOCOL = 'mml';

export const connectLink = (serverUrl: string) =>
  `${LAUNCHER_PROTOCOL}://connect?server=${encodeURIComponent(serverUrl)}`;
