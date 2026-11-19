import type { AdminPack, AdminRelease, ChannelName } from '@mmp/schema';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { api, errorMessage } from '../api';
import PackSidebar from '../components/PackSidebar';
import Shell from '../components/Shell';
import { notify } from '../components/Toast';
import { Frame } from '../components/ui';
import { usePolling, useRefreshOnFocus } from '../hooks';
import { usePacks } from '../packs';

const parseVersion = (name: string) => {
  const match = name.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : [0, 0, 0];
};

/** Newest version number first; the release on Current always on top. */
function sortReleases(releases: AdminRelease[], pack: AdminPack | null): AdminRelease[] {
  const sorted = [...releases].sort((a, b) => {
    const va = parseVersion(a.name);
    const vb = parseVersion(b.name);
    for (let i = 0; i < 3; i++) if (va[i] !== vb[i]) return vb[i]! - va[i]!;
    return b.createdAt.localeCompare(a.createdAt);
  });
  const current = sorted.findIndex((r) => r.id === pack?.channels.stable);
  if (current > 0) sorted.unshift(...sorted.splice(current, 1));
  return sorted;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const PILL = 'flex h-[20px] w-[114px] items-center justify-center rounded-[5px] text-[15px] font-semibold leading-none';

/** Status column: channel pill once imported, otherwise the import state. */
function StatusPill({ release, pack, onMakeCurrent }: { release: AdminRelease; pack: AdminPack; onMakeCurrent: () => void }) {
  if (release.status === 'importing') {
    return <span className={`${PILL} bg-[#1e4a7a] text-white`}>Importing {Math.round(release.importProgress * 100)}%</span>;
  }
  if (release.status === 'needs_files') {
    return <span className={`${PILL} bg-[#8a5a12] text-white`} title="Some mods must be uploaded by hand. Open the version to add them.">Needs Files</span>;
  }
  if (release.status === 'failed') {
    return <span className={`${PILL} bg-[#7a2a2a] text-white`} title={release.error ?? ''}>Import Failed</span>;
  }
  if (pack.channels.stable === release.id) return <span className={`${PILL} bg-mm-released text-white`}>Current</span>;
  if (pack.channels.dev === release.id) {
    return (
      <button type="button" className={`${PILL} bg-mm-dev text-white`} onClick={onMakeCurrent} title="On the Dev Build channel. Click to make it Current.">
        Dev Build
      </button>
    );
  }
  return (
    <button type="button" className={`${PILL} bg-mm-off text-[#7c7c7c] hover:text-white`} onClick={onMakeCurrent}>
      Make Current
    </button>
  );
}

function IconButton({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex size-[27px] shrink-0 items-center justify-center transition hover:brightness-125"
    >
      <img src={src} alt="" width={27} height={27} />
    </button>
  );
}

export default function Versions() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { packs, loaded, refresh } = usePacks();
  const pack = packs.find((p) => p.id === id) ?? null;
  const [releases, setReleases] = useState<AdminRelease[]>([]);
  const [fetched, setFetched] = useState(false);
  const selectedId = params.get('selected');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setReleases(await api.listReleases(id));
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setFetched(true);
    }
  }, [id]);

  useEffect(() => {
    setFetched(false);
    void load();
  }, [load]);
  useRefreshOnFocus(load);
  usePolling(releases.some((r) => r.status === 'importing'), 1500, load);

  const sorted = sortReleases(releases, pack);
  const selected = sorted.find((r) => r.id === selectedId) ?? sorted[0] ?? null;

  if (loaded && !pack) return <Navigate to="/" replace />;

  const select = (release: AdminRelease) => setParams({ selected: release.id }, { replace: true });

  const setChannel = async (release: AdminRelease, channel: ChannelName, on: boolean) => {
    if (!pack) return;
    if (on && release.status !== 'ready') {
      notify('A version can be published once its import has finished and no files are missing.');
      return;
    }
    try {
      await api.setChannel(pack.id, channel, on ? release.id : null);
      await Promise.all([refresh(), load()]);
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const toggleVisible = async (release: AdminRelease) => {
    try {
      const updated = await api.updateRelease(release.id, { changelogVisible: !release.changelogVisible });
      setReleases((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const remove = async (release: AdminRelease) => {
    if (!confirm(`Delete ${release.name}? This can't be undone.`)) return;
    try {
      await api.deleteRelease(release.id);
      if (selectedId === release.id) setParams({}, { replace: true });
      await Promise.all([refresh(), load()]);
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const sidebar = (
    <PackSidebar
      activeId={id ?? null}
      actions={{
        left: { label: 'Go Back', tone: 'secondary', onClick: () => navigate(`/packs/${id}`) },
        right: { label: 'Add Version', tone: 'primary', onClick: () => navigate(`/packs/${id}/versions/new`) },
      }}
    />
  );

  return (
    <Shell sidebar={sidebar}>
      <Frame className="absolute left-[28px] top-[25px] h-[753px] w-[1375px] rounded-[25px] backdrop-blur-[50px]">
        {/* Table header */}
        <div className="absolute left-[15px] top-[14px] flex h-[46px] w-[681px] items-center rounded-t-[10px] bg-mm-surface text-[20px] font-semibold leading-none">
          <img src="/ui/head-eye.svg" alt="" width={27} height={27} title="Changelog shown in the launcher" className="ml-[13px]" />
          <span className="ml-[22px] w-[143px]">Version #</span>
          <span className="w-[245px]">File Name</span>
          <span className="w-[148px]">Status</span>
          <img src="/ui/head-edit.svg" alt="" width={27} height={27} />
          <img src="/ui/head-delete.svg" alt="" width={27} height={27} className="ml-[15px]" />
        </div>

        {/* Rows */}
        <div className="absolute left-[15px] top-[76px] flex h-[660px] w-[681px] flex-col gap-[2px] overflow-y-auto rounded-b-[25px] pt-[4px]">
          {fetched && sorted.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-[16px] text-[20px] text-[#6b6b6b]">
              <p>No versions yet.</p>
              <button
                type="button"
                className="h-[37px] rounded-[10px] bg-mm-accent px-[20px] font-semibold text-white"
                onClick={() => navigate(`/packs/${id}/versions/new`)}
              >
                Add the first version
              </button>
            </div>
          )}
          {pack &&
            sorted.map((release) => {
              const active = selected?.id === release.id;
              return (
                <div
                  key={release.id}
                  onClick={() => select(release)}
                  className={`flex h-[38px] w-full shrink-0 cursor-pointer items-center rounded-[5px] text-[20px] leading-none ${
                    active ? 'bg-mm-frame' : 'hover:bg-mm-surface'
                  }`}
                >
                  <IconButton
                    src={release.changelogVisible ? '/ui/row-eye.svg' : '/ui/head-eye.svg'}
                    label={release.changelogVisible ? 'Changelog shown in the launcher. Click to hide it.' : 'Changelog hidden. Click to show it in the launcher.'}
                    onClick={() => toggleVisible(release)}
                  />
                  <span className="ml-[22px] w-[143px] truncate pr-[10px]" title={release.name}>
                    {release.name}
                  </span>
                  <span className="w-[245px] truncate pr-[12px]" title={release.sourceFilename}>
                    {release.sourceFilename || '—'}
                  </span>
                  <span className="w-[148px]" onClick={(e) => e.stopPropagation()}>
                    <StatusPill release={release} pack={pack} onMakeCurrent={() => setChannel(release, 'stable', true)} />
                  </span>
                  <IconButton src="/ui/row-edit.svg" label="Edit version" onClick={() => navigate(`/packs/${id}/versions/${release.id}`)} />
                  <span className="ml-[15px]">
                    <IconButton src="/ui/row-delete.svg" label="Delete version" onClick={() => remove(release)} />
                  </span>
                </div>
              );
            })}
        </div>

        {/* Changelog preview */}
        <div className="absolute left-[721px] top-[14px] flex h-[46px] w-[637px] items-center justify-center rounded-t-[10px] bg-mm-surface text-[20px] font-semibold leading-none">
          Changelog Preview
        </div>
        <div className="absolute left-[721px] top-[76px] flex h-[660px] w-[637px] flex-col overflow-hidden rounded-b-[25px] bg-mm-surface">
          {!selected || !pack ? (
            <div className="flex flex-1 items-center justify-center text-[20px] text-[#6b6b6b]">Wow, such empty!</div>
          ) : (
            <>
              <div className="flex shrink-0 items-start justify-between px-[17px] pt-[14px] text-[20px] font-semibold leading-none">
                <span className="truncate pr-[20px]">{selected.name}</span>
                <span className="shrink-0">{selected.displayDate}</span>
              </div>

              <div className="mt-[14px] flex shrink-0 flex-wrap items-center gap-[8px] px-[17px] text-[15px] leading-none text-mm-muted">
                <ChannelToggle
                  label="Current"
                  on={pack.channels.stable === selected.id}
                  color="bg-mm-released"
                  onToggle={(on) => setChannel(selected, 'stable', on)}
                  title="Every player who can see this pack gets this version."
                />
                <ChannelToggle
                  label="Dev Build"
                  on={pack.channels.dev === selected.id}
                  color="bg-mm-dev"
                  onToggle={(on) => setChannel(selected, 'dev', on)}
                  title="Only players on the Manage Access list get this version."
                />
                {selected.minecraft && (
                  <span className="ml-[6px]">
                    {selected.minecraft} · {selected.loader?.type} {selected.loader?.version ?? ''} · {selected.fileCount} files · {formatBytes(selected.sizeBytes)}
                  </span>
                )}
                {selected.cleanInstall && <span className="font-semibold text-[#ff6b6b]">Clean install</span>}
                {!selected.changelogVisible && <span className="font-semibold text-mm-dev">Changelog hidden</span>}
              </div>

              {selected.error && <p className="mx-[17px] mt-[14px] shrink-0 text-[17px] text-[#ff8a8a]">{selected.error}</p>}
              {selected.status === 'needs_files' && (
                <button
                  type="button"
                  className="mx-[17px] mt-[14px] shrink-0 rounded-[10px] border border-[#8a5a12] px-[14px] py-[8px] text-left text-[16px] text-[#ffcf80] hover:bg-[#8a5a12]/30"
                  onClick={() => navigate(`/packs/${id}/versions/${selected.id}`)}
                >
                  {selected.missing.length} mod{selected.missing.length === 1 ? '' : 's'} must be uploaded by hand before this version can be published. Open it to add them →
                </button>
              )}

              <div className="mt-[22px] min-h-0 flex-1 overflow-y-auto px-[17px] pb-[20px]">
                {selected.changelogHtml.replace(/<[^>]*>/g, '').trim() || /<(img|iframe)/.test(selected.changelogHtml) ? (
                  // Sanitised by the server when saved.
                  <div className="changelog-sm [text-shadow:0_0_75px_black]" dangerouslySetInnerHTML={{ __html: selected.changelogHtml }} />
                ) : (
                  <p className="pt-[200px] text-center text-[20px] text-[#6b6b6b]">No changelog for this version.</p>
                )}
              </div>
            </>
          )}
        </div>
      </Frame>
    </Shell>
  );
}

function ChannelToggle({
  label,
  on,
  color,
  onToggle,
  title,
}: {
  label: string;
  on: boolean;
  color: string;
  onToggle: (on: boolean) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={`${title} ${on ? 'Click to take it off.' : 'Click to publish.'}`}
      onClick={() => onToggle(!on)}
      className={`flex h-[24px] items-center gap-[6px] rounded-[5px] px-[10px] text-[15px] font-semibold leading-none ${
        on ? `${color} text-white` : 'bg-mm-off text-[#9a9a9a] hover:text-white'
      }`}
    >
      {on ? '✓' : '+'} {label}
    </button>
  );
}
