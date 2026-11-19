import type {
  AdminPack,
  AdminRelease,
  AdminSettings,
  AdminUser,
  ApiError,
  ChannelName,
  GroupMember,
  Media,
  ReportDetail,
  ReportSummary,
  ServerHealth,
  UpdateStatus,
  MediaKind,
  PackBody,
  ReleaseCreateBody,
  ReleaseUpdateBody,
  SettingsBody,
  SetupStatus,
  UploadSession,
} from '@mmp/schema';

const BASE = '/api/v1';
const CHUNK_RETRIES = 5;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Called on any 401 from an admin route, so the app can send the user to the sign-in page. */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (handler: () => void) => {
  onUnauthorized = handler;
};

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isRaw = body instanceof Blob;
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined || isRaw ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : isRaw ? body : JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    // A wrong password or setup code is a 401 too, but it doesn't mean the session ended.
    const signInCall = path === '/admin/login' || path === '/admin/me' || path.startsWith('/admin/setup');
    if (res.status === 401 && !signInCall) onUnauthorized();
    throw new ApiRequestError(res.status, err?.error ?? 'error', err?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

const get = <T>(path: string) => request<T>('GET', path);
const post = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
const del = <T = { ok: true }>(path: string) => request<T>('DELETE', path);

/** Sends a file in chunks and resumes from the server's offset if a chunk fails. */
async function uploadFile(file: File, onProgress?: (percent: number) => void): Promise<string> {
  let session = await post<UploadSession>('/admin/uploads', { filename: file.name, size: file.size });
  let failures = 0;
  while (session.received < session.size) {
    const chunk = file.slice(session.received, session.received + session.chunkSize);
    try {
      session = await request<UploadSession>('PUT', `/admin/uploads/${session.id}`, chunk, {
        'content-type': 'application/octet-stream',
        'upload-offset': String(session.received),
      });
      failures = 0;
      onProgress?.(Math.round((session.received / session.size) * 100));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status !== 409 && err.status < 500) throw err;
      if (++failures > CHUNK_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 1000 * failures));
      session = await get<UploadSession>(`/admin/uploads/${session.id}`);
    }
  }
  return session.id;
}

export const api = {
  setupStatus: () => get<SetupStatus>('/admin/setup'),
  checkSetupCode: (code: string) => post<{ ok: true }>('/admin/setup/check', { code }),
  setup: (body: { code: string; username: string; password: string; communityName: string }) =>
    post<AdminUser>('/admin/setup', body),
  login: (username: string, password: string) => post<AdminUser>('/admin/login', { username, password }),
  logout: () => post('/admin/logout'),
  me: () => get<AdminUser>('/admin/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    post('/admin/me/password', { currentPassword, newPassword }),

  listPacks: () => get<AdminPack[]>('/admin/packs'),
  getPack: (id: string) => get<AdminPack>(`/admin/packs/${id}`),
  createPack: (body: PackBody) => post<AdminPack>('/admin/packs', body),
  updatePack: (id: string, body: PackBody) => put<AdminPack>(`/admin/packs/${id}`, body),
  deletePack: (id: string) => del(`/admin/packs/${id}`),
  setChannel: (packId: string, channel: ChannelName, releaseId: string | null) =>
    put<AdminPack>(`/admin/packs/${packId}/channels/${channel}`, { releaseId }),

  listReleases: (packId: string) => get<AdminRelease[]>(`/admin/packs/${packId}/releases`),
  getRelease: (id: string) => get<AdminRelease>(`/admin/releases/${id}`),
  createRelease: (packId: string, body: ReleaseCreateBody) => post<AdminRelease>(`/admin/packs/${packId}/releases`, body),
  updateRelease: (id: string, body: ReleaseUpdateBody) => patch<AdminRelease>(`/admin/releases/${id}`, body),
  deleteRelease: (id: string) => del(`/admin/releases/${id}`),
  reimportRelease: (id: string, uploadId: string) => post<AdminRelease>(`/admin/releases/${id}/reimport`, { uploadId }),
  resolveMissing: (id: string, path: string, uploadId: string) =>
    post<AdminRelease>(`/admin/releases/${id}/missing`, { path, uploadId }),

  uploadFile,
  /** `packId` attaches a screenshot to one pack instead of the server-wide set. */
  uploadMedia: (file: File, kind: MediaKind, packId?: string) =>
    request<Media>('POST', `/admin/media?kind=${kind}${packId ? `&pack=${encodeURIComponent(packId)}` : ''}`, file, {
      'content-type': 'application/octet-stream',
    }),

  /** Server-wide screenshots, or one pack's when `packId` is given. */
  listScreenshots: (packId?: string) =>
    get<Media[]>(`/admin/screenshots${packId ? `?pack=${encodeURIComponent(packId)}` : ''}`),
  deleteScreenshot: (id: string) => del(`/admin/screenshots/${id}`),

  listDevelopers: () => get<GroupMember[]>('/admin/developers'),
  addDeveloper: (username: string) => post<GroupMember>('/admin/developers', { username }),
  removeDeveloper: (uuid: string) => del(`/admin/developers/${uuid}`),

  listReports: () => get<ReportSummary[]>('/admin/reports'),
  getReport: (id: string) => get<ReportDetail>(`/admin/reports/${id}`),
  deleteReport: (id: string) => del(`/admin/reports/${id}`),

  getSettings: () => get<AdminSettings>('/admin/settings'),
  updateSettings: (body: SettingsBody) => patch<AdminSettings>('/admin/settings', body),

  health: () => get<ServerHealth>('/admin/system/health'),
  updateStatus: (refresh = false) => get<UpdateStatus>(`/admin/system/update${refresh ? '?refresh=1' : ''}`),
};

export const mediaUrl = (sha256: string | null | undefined) => (sha256 ? `/media/${sha256}` : null);

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
