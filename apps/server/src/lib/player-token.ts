import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PlayerClaims {
  uuid: string;
  username: string;
  /** Unix seconds. */
  exp: number;
}

export const PLAYER_TOKEN_TTL_SECONDS = 24 * 60 * 60;

/** A compact HMAC-signed token: base64url(json).base64url(sig). */
export function signPlayerToken(claims: PlayerClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}

export function verifyPlayerToken(token: string, secret: string): PlayerClaims | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PlayerClaims;
    if (typeof claims.uuid !== 'string' || typeof claims.exp !== 'number') return null;
    if (claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
