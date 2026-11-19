import type { FastifyInstance, FastifyRequest } from 'fastify';
import { LAUNCHER_DOWNLOADS, connectLink } from '@mmp/schema';
import type { AppContext } from '../context';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The public URL from Settings, or the address this request came in on. */
export function serverUrl(ctx: AppContext, request: FastifyRequest): string {
  const saved = ctx.settings.get('publicUrl');
  return saved || `${request.protocol}://${request.host}`;
}

/**
 * The page creators share with players (Discord won't link mml:// directly). It offers the launcher
 * download and an "Open in launcher" button that fills in this server.
 */
export async function joinRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/join', async (request, reply) => {
    const name = escapeHtml(ctx.settings.get('communityName'));
    const server = serverUrl(ctx, request);
    const open = escapeHtml(connectLink(server));
    const downloads = LAUNCHER_DOWNLOADS
      ? `<div class="downloads">
          <a class="button" href="${escapeHtml(LAUNCHER_DOWNLOADS.windows)}">Download for Windows</a>
          <a class="button" href="${escapeHtml(LAUNCHER_DOWNLOADS.mac)}">Download for macOS</a>
          <a class="button" href="${escapeHtml(LAUNCHER_DOWNLOADS.linux)}">Download for Linux</a>
        </div>
        <p class="step">Already installed? Open it straight to ${name}:</p>`
      : `<p class="step">The launcher download isn't available yet. If you already have the launcher:</p>`;

    reply.header('content-type', 'text/html; charset=utf-8');
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Play ${name}</title>
<meta property="og:title" content="Play ${name}">
<meta property="og:description" content="Get the launcher and join ${name}.">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px;
    font: 17px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #fff; background: #0e0e12; }
  main { position: relative; width: 100%; max-width: 520px; padding: 32px; border-radius: 25px; background: rgba(25,25,30,.94); border: 2px solid #3e3e5d; text-align: center; }
  h1 { margin: 0 0 4px; font-size: 30px; }
  p { color: #bbb; margin: 8px 0; }
  .step { margin-top: 24px; }
  .downloads { display: grid; gap: 10px; margin-top: 24px; }
  .button { display: block; padding: 12px 18px; border-radius: 10px; background: #282a2e; color: #fff; text-decoration: none; font-weight: 600; }
  .button:hover { filter: brightness(1.2); }
  .primary { background: #1eb298; }
  code { display: block; margin-top: 8px; padding: 10px; border-radius: 6px; background: #111; color: #ddd; word-break: break-all; }
</style>
</head>
<body>
<main>
  <h1>${name}</h1>
  <p>Install the launcher to play ${name}'s modpacks.</p>
  ${downloads}
  <a class="button primary" href="${open}">Open in launcher</a>
  <p class="step">Or add this server address in the launcher:</p>
  <code>${escapeHtml(server)}</code>
</main>
</body>
</html>`;
  });
}
