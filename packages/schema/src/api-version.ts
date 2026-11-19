/**
 * The version of the contract between MMP and MML. The server sends it on every `/api/v1`
 * response, and the launcher refuses to talk to a server with a different one.
 *
 * Bump it for any change an older launcher or server can't cope with: a removed or renamed field,
 * a changed meaning, a new required field, or a manifest change older launchers would misread.
 * Adding an optional field that the other side can ignore doesn't need a bump.
 */
export const API_VERSION = 1;

export const API_VERSION_HEADER = 'x-mm-api-version';
