export interface MojangProfile {
  /** UUID without dashes. */
  id: string;
  name: string;
}

export interface MojangClient {
  lookupUsername(username: string): Promise<MojangProfile | null>;
  /** The server half of the Minecraft session handshake. */
  hasJoined(username: string, serverId: string): Promise<MojangProfile | null>;
}

export function createMojangClient(fetchFn: typeof fetch = fetch): MojangClient {
  async function getProfile(url: string): Promise<MojangProfile | null> {
    const res = await fetchFn(url, { headers: { accept: 'application/json' } });
    if (res.status === 204 || res.status === 404) return null;
    if (!res.ok) throw new Error(`Mojang API returned ${res.status}`);
    const json = (await res.json()) as Partial<MojangProfile>;
    return typeof json.id === 'string' && typeof json.name === 'string' ? { id: json.id, name: json.name } : null;
  }

  return {
    lookupUsername: (username) =>
      getProfile(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`),
    hasJoined: (username, serverId) =>
      getProfile(
        `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(username)}&serverId=${encodeURIComponent(serverId)}`,
      ),
  };
}
