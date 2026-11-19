import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Workspace packages ship TypeScript source, so they're bundled in. npm dependencies stay external.
  noExternal: [/^@mmp\//],
  external: [/^(?!@mmp\/)[^./]/],
});
