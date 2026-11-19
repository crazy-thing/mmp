# MMP: Modpack Management Panel

The self-hosted server that modpack creators run. It publishes packs, serves the admin panel, and hosts the files that aren't available from a CDN. Players install and update the packs through **[MML](https://github.com/crazy-thing/mml)** (Modpack Management Launcher).

**Creators:** see **[deploy/README.md](deploy/README.md)** to install it. The image is [`crazything1/mmp`](https://hub.docker.com/r/crazything1/mmp) on Docker Hub.

**Status:** the server, admin panel and launcher work end to end on macOS (install and launch a Fabric pack). Not done yet: Windows/Linux testing, the v4 data migration, and publishing launcher builds.

## Layout

```
apps/server         Fastify API + serves the panel and files. SQLite (Drizzle), files on disk.
apps/panel          Admin panel (React + Vite + Tailwind). Dark design from the MMPanel Figma file.
packages/schema     @mmp/schema: the API and manifest types MML and MMP share. MML keeps a synced copy.
packages/importers  Turns a CurseForge export or Modrinth .mrpack into a manifest.
deploy/             Docker Compose files and the creator install guides.
scripts/            Dev helpers (seed-demo.ts).
```

## Running it

Needs Node 22.12 or newer.

```sh
npm install
npm run build          # builds the panel, then the server
npm start              # http://localhost:8080, data in ./data
```

The first visit opens a setup wizard. It asks for the **setup code** the server prints in its log on first start (also saved as `data/setup-code.txt`), so nobody else can claim a freshly exposed server. Then it creates the owner account and sets the public URL.

### Development

Two terminals:

```sh
npm run dev:server     # API on :8080, restarts on change
npm run dev:panel      # panel on :5173 with hot reload, proxies /api to :8080
```

Then open http://localhost:5173. To fill a fresh server with demo packs, finish setup in the browser and run:

```sh
npm run seed -- http://localhost:8080 <username> <password>
```

### Tests

```sh
npm test               # importers and server end-to-end tests (vitest)
npm run typecheck
```

## The shared schema package

`packages/schema` (`@mmp/schema`) is the contract between MMP and the MML launcher: API types, the manifest format, and the `mml://` link helpers. **This repo owns it.** The MML repo keeps a copy in its own `packages/schema`, which it updates with `npm run sync-schema` and never edits by hand.

Both sides check they match at runtime. Every `/api/v1` response carries an `x-mm-api-version` header with `API_VERSION` from [`api-version.ts`](packages/schema/src/api-version.ts), and the launcher refuses a server whose version differs from its own, with a message saying which side needs updating.

When you change the schema:

1. Decide whether it's breaking (see the comment in `api-version.ts`). If an older launcher or server would misbehave, bump `API_VERSION`.
2. Commit it here.
3. In the MML repo, run `npm run sync-schema` and commit the result.

A version bump means players have to update the launcher before they can use servers running the new MMP, so ship the launcher release at about the same time.

[docs/schema-on-npm.md](docs/schema-on-npm.md) describes publishing the schema to npm instead, for later.

## Releasing MMP

Creators run the `crazything1/mmp` image from Docker Hub, built for both amd64 (most PCs and servers) and arm64 (Apple silicon, Raspberry Pi, ARM VPSs). There are two ways to publish it.

### From GitHub (normal releases)

1. Set the new `version` in `apps/server/package.json`. Keep the root and panel `package.json` versions in step.
2. Commit, then tag and push: `git tag v5.0.0 && git push origin v5.0.0`.

The **Release** workflow runs the tests, builds both architectures, and pushes them to Docker Hub. It then creates the GitHub release, and that release is what makes creators' panels show "update available".

The workflow needs two repo secrets:
- `DOCKERHUB_USERNAME`: `crazything1`.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with Read & Write (Docker Hub › Account settings › Personal access tokens).

### From your own machine

Useful before the GitHub repo exists, or to get a test build onto another computer. It needs Docker Desktop running and a Docker Hub login (an access token works as the password):

```sh
docker login -u crazything1
npm run release:image                       # builds amd64 + arm64, pushes nothing: a check
npm run release:image -- --push             # builds and pushes crazything1/mmp:<version>
npm run release:image -- --push --latest    # pre-release only: also move `latest`, so a plain install picks it up
```

This doesn't create a GitHub release, so panels won't be told about the update. The first push creates the `crazything1/mmp` repository on Docker Hub. Check it's set to **Public** under the repository's **Settings**, or other computers can't pull it without logging in.

### Tags

- A full release like `5.0.0` also moves the `5.0`, `5` and `latest` tags.
- A pre-release like `5.0.0-alpha.1` only gets its exact tag, unless you push it with `--latest`. On GitHub it's marked as a pre-release, so only panels already running a pre-release are told about it.
- The install guides use `latest`. While only pre-releases exist, either push with `--latest`, or tell testers to put `MMP_VERSION=5.0.0-alpha.0` in a `.env` file next to `docker-compose.yml`.

### Testing a build locally

```sh
docker build -t crazything1/mmp:dev .
docker run -p 8080:8080 -v mmp-data:/data crazything1/mmp:dev
```

## Configuration

Everything else (community name, CurseForge key, public URL, admin password) is set in the panel's Settings page.

| Env var | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `HOST` | `0.0.0.0` | Listen address |
| `DATA_DIR` | `./data` | Database (`mmp.db`), stored files (`blobs/`) and temp uploads (`tmp/`). Back up this folder |
| `SECURE_COOKIES` | `false` | Set `true` when served over HTTPS |
| `TRUST_PROXY` | `false` | Set `true` behind a reverse proxy so rate limits see real client IPs |
| `PANEL_DIR` | `apps/panel/dist` | Built panel to serve. Empty string disables it |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `UPDATE_FEED` | this repo's GitHub releases | Where the panel checks for newer `v*` releases. Empty string switches the check off |

## How it differs from v4

- **Admin sign-in** is a username and password stored on the server (scrypt hashed, session cookie). No Azure app registration.
- **Every admin route requires a session.** That includes uploads (v4 accepted uploads before checking the key).
- **Uploads are resumable**: the panel sends 8 MB chunks and picks up where it left off after a dropped connection.
- **Releases are imported, not just stored.** The server reads the CurseForge or Modrinth export and builds a manifest of every file with its hash. Mods are listed by their CDN URL; only overrides and files that can't be downloaded elsewhere are stored on the server. The launcher never needs a CurseForge key.
- **Mods whose authors opted out of third-party downloads** show up as "Needs Files" on the version. The creator downloads them once and uploads them in the version editor, and the server checks the hash matches.
- **"Make Current"** publishes a version to the `stable` channel. **"Make Dev"** publishes it to the `dev` channel, which only players on the DEV Access list receive.
- **Dev packs and dev versions are actually private.** The server only returns them to players who proved who they are through Mojang's session handshake and are on the DEV Access list. DEV Access stores UUIDs, so renaming an account doesn't drop access.
- **Changelogs are sanitised** on the server before they're stored.
- **Images are stored by their hash**, and only PNG, JPEG, GIF and WebP are accepted.

## API overview

All under `/api/v1`. Types are in `packages/schema/src/api.ts`.

| Who | Endpoints |
|---|---|
| Launcher | `GET /launcher/config`, `GET /packs`, `GET /packs/:slug`, `GET /packs/:slug/channels/:channel/manifest`, `GET /packs/:slug/channels/:channel/files/:sha256`, `POST /auth/challenge`, `POST /auth/verify` |
| Website | `GET /public/screenshots`, `GET /media/:sha256` and `GET /join` (the shareable join page), all outside `/api/v1` |
| Panel | `/admin/setup`, `/admin/setup/check`, `/admin/system/health`, `/admin/system/update`, `/admin/login`, `/admin/logout`, `/admin/me`, `/admin/packs`, `/admin/releases`, `/admin/uploads`, `/admin/media`, `/admin/screenshots`, `/admin/developers`, `/admin/settings` |

Player requests send `Authorization: Bearer <token>` from `/auth/verify`. Without it, the launcher only sees released packs on the stable channel.
