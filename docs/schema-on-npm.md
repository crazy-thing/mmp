# Publishing the schema to npm (future)

Today the MML launcher keeps a **synced copy** of `packages/schema`: `npm run sync-schema` in the MML repo copies it from here, and `npm run check-schema` stops hand edits. Both sides check `API_VERSION` at runtime. That's enough while one person works on both repos.

This doc is the plan for replacing the copy with a published npm package, and how to tell when it's worth doing.

## When to switch

Move to npm when one of these becomes true:

- **Other people build against the API.** Examples: a community website, a Discord bot, or a third-party tool reading packs or the public screenshots endpoint. They'd want `npm install` and typed responses.
- **More than one person works on the launcher**, or the launcher is built somewhere that can't see a checkout of MMP.
- **Copies keep getting out of step**, for example a launcher release goes out with a stale schema because someone forgot to sync.
- **You want to support several launcher versions at once** and need to know exactly which schema each one was built with.

Until then, npm adds a publish step to every schema change for little gain.

## What gets published

The package would be **`@crazything/mm-schema`**. The scope has to match an npm account or organisation you own (`crazything`), so create that first.

Contents, which a dry run in November 2026 confirmed at 10 files and about 12 KB:

- The compiled JavaScript and type definitions (`dist/index.js`, `dist/index.d.ts`, source map).
- The TypeScript source (`src/`).
- `README.md` and `package.json`.

What's in it: zod schemas and TypeScript types for the API requests and responses (including the admin API's shape, which is already visible in the panel's JavaScript), the manifest format, `API_VERSION`, and the `mml://` link helpers. No server code, configuration, keys or personal details. Recheck this with `npm publish --dry-run` before the first publish.

**Permanent decisions:**
- A published version can never be reused.
- A package can only be removed within 72 hours, and only if nothing depends on it.
- Pick the licence first. `UNLICENSED` means visible but nobody else may use it. If outside developers are the reason for switching, use a permissive licence such as MIT for this package.

## Changes needed in this repo

1. **`packages/schema/package.json`**: rename to `@crazything/mm-schema`, remove `"private": true`, and add:

   ```json
   "license": "UNLICENSED",
   "repository": { "type": "git", "url": "git+https://github.com/crazy-thing/mmp.git", "directory": "packages/schema" },
   "sideEffects": false,
   "exports": {
     ".": {
       "source": "./src/index.ts",
       "types": "./dist/index.d.ts",
       "default": "./dist/index.js"
     }
   },
   "files": ["dist", "src"],
   "scripts": { "build": "tsup", "typecheck": "tsc -p tsconfig.json", "prepublishOnly": "npm run build" },
   "devDependencies": { "tsup": "^8.5.0" },
   "publishConfig": { "access": "public" }
   ```

   The `source` export condition lets this repo keep reading the TypeScript source with no build step, while npm users get the compiled files.

2. **`packages/schema/tsup.config.ts`**:

   ```ts
   import { defineConfig } from 'tsup';
   export default defineConfig({ entry: ['src/index.ts'], format: ['esm'], target: 'es2022', dts: true, sourcemap: true, clean: true });
   ```

3. **Turn on the `source` condition everywhere this repo reads the schema:**
   - `tsconfig.base.json`: `"customConditions": ["source"]`.
   - `apps/panel/vite.config.ts`: `resolve: { conditions: ['source', ...defaultClientConditions] }`, with `defaultClientConditions` imported from `vite`.
   - `apps/server/tsup.config.ts`: add `/^@crazything\/mm-schema$/` to `noExternal`, exclude it from `external`, and set `esbuildOptions(o) { o.conditions = ['source']; }`.
   - `apps/server/package.json` dev script: `tsx watch --conditions=source …`. The root `seed` script needs `node --conditions=source --import tsx …`.
   - A root `vitest.config.ts`, importing `defaultServerConditions` from `vite` (not from `vitest/config`, which doesn't export it):

     ```ts
     import { defaultServerConditions } from 'vite';
     import { defineConfig } from 'vitest/config';
     export default defineConfig({
       resolve: { conditions: ['source', ...defaultServerConditions] },
       ssr: { resolve: { conditions: ['source', ...defaultServerConditions] } },
     });
     ```

4. **Rename imports:** `@mmp/schema` becomes `@crazything/mm-schema` across `apps/` and `packages/`.

5. **Add a publish workflow**, `.github/workflows/schema.yml`, triggered by `schema-v*` tags. It needs `permissions: { id-token: write, contents: read }`, Node 24 with `registry-url: https://registry.npmjs.org`, and `npm install -g npm@latest`, because trusted publishing needs npm 11.5.1 or newer. It should check the tag matches `packages/schema/package.json`, then run the typecheck and tests, then `npm publish --workspace @crazything/mm-schema`.

6. **CI** (`ci.yml`): add a step that builds the package, so a broken build is caught before release.

## Changes needed in the MML repo

1. Delete `packages/schema` and `scripts/sync-schema.mjs`, and remove the `sync-schema` and `check-schema` scripts and the CI step.
2. In `apps/launcher`, `packages/engine` and `packages/sync`, depend on `"@crazything/mm-schema": "^1.0.0"` (whatever version you published), and rename the imports.
3. No build changes. The launcher's tsup config already bundles every dependency, and npm consumers get the compiled `dist/` by default.

## First publish

The first version is published by hand, because npm needs the package to exist before trusted publishing can be configured:

```sh
npm login                                            # account with 2FA on
npm publish --dry-run --workspace @crazything/mm-schema   # check the file list
npm publish --workspace @crazything/mm-schema
npm view @crazything/mm-schema                       # confirm the version and files
```

Then on npmjs.com, open the package's **Settings › Trusted publishing**, and add GitHub Actions with repository `crazy-thing/mmp` and workflow `schema.yml`. From then on, a `schema-v*` tag publishes it with no token stored anywhere, and npm shows a provenance badge linking each version to the commit that built it.

## Versioning once it's on npm

Use the package's semver major version and `API_VERSION` together:

- **Patch** (1.0.1): fixes and doc comments; no type changes.
- **Minor** (1.1.0): additions that older code can ignore, such as a new optional field or a new endpoint type. `API_VERSION` stays the same.
- **Major** (2.0.0): anything an older launcher or server can't cope with. Bump `API_VERSION` in the same release, so mismatched launchers and servers refuse each other with a clear message instead of failing in odd ways.

The launcher's `^1.0.0` range then picks up patch and minor releases on `npm update`, and never a major one by accident.
