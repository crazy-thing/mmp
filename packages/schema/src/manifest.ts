import { z } from 'zod';
import { isSafeRelativePath } from './paths';

export const LOADER_TYPES = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'] as const;
export type LoaderType = (typeof LOADER_TYPES)[number];

export const loaderSchema = z.object({
  type: z.enum(LOADER_TYPES),
  /** Loader version, e.g. "0.15.11" for Fabric or "47.2.0" for Forge. Absent for vanilla. */
  version: z.string().min(1).optional(),
});
export type Loader = z.infer<typeof loaderSchema>;

const hex = (length: number) => z.string().regex(new RegExp(`^[0-9a-f]{${length}}$`));

/**
 * sha1 is always present because it's the one hash CurseForge, Modrinth and Mojang all publish.
 * Files stored on the creator's server also carry sha256, which is their storage key.
 */
export const fileHashesSchema = z.object({
  sha1: hex(40),
  sha256: hex(64).optional(),
  sha512: hex(128).optional(),
});
export type FileHashes = z.infer<typeof fileHashesSchema>;

export const fileSourceSchema = z.discriminatedUnion('type', [
  /** Public CDN URL (forgecdn, Modrinth CDN). Needs no credentials. */
  z.object({ type: z.literal('url'), url: z.url({ protocol: /^https$/ }) }),
  /** Stored on the creator's server, fetched by sha256 through the channel's files endpoint. */
  z.object({ type: z.literal('blob') }),
]);
export type FileSource = z.infer<typeof fileSourceSchema>;

export const FILE_POLICIES = ['overwrite', 'default'] as const;
export type FilePolicy = (typeof FILE_POLICIES)[number];

export const manifestFileSchema = z
  .object({
    path: z.string().refine(isSafeRelativePath, 'Path must be relative and stay inside the instance'),
    size: z.number().int().nonnegative(),
    hashes: fileHashesSchema,
    source: fileSourceSchema,
    /**
     * overwrite: the launcher keeps the file identical to the manifest.
     * default: written only if missing, so player edits survive updates.
     */
    policy: z.enum(FILE_POLICIES).default('overwrite'),
  })
  .refine((f) => f.source.type !== 'blob' || f.hashes.sha256 !== undefined, {
    message: 'Blob files need a sha256',
  });
export type ManifestFile = z.infer<typeof manifestFileSchema>;

export const MANIFEST_SCHEMA_VERSION = 1;

export const manifestSchema = z.object({
  schema: z.literal(MANIFEST_SCHEMA_VERSION),
  pack: z.object({ id: z.string(), slug: z.string(), name: z.string() }),
  release: z.object({ id: z.string(), name: z.string() }),
  minecraft: z.string().min(1),
  loader: loaderSchema,
  /** Recommended memory in MB. The launcher's RAM setting overrides it. */
  memory: z.object({ recommendedMb: z.number().int().positive() }).optional(),
  jvmArgs: z.array(z.string()).default([]),
  /**
   * When installing this release over a different one, the launcher empties the instance folder
   * first (saves and player-added files included). Absent means false.
   */
  cleanInstall: z.boolean().optional(),
  files: z.array(manifestFileSchema),
});
export type Manifest = z.infer<typeof manifestSchema>;
