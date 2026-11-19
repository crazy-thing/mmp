import type { AdminRelease, MissingFile } from '@mmp/schema';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api';
import PackSidebar from '../components/PackSidebar';
import Shell from '../components/Shell';
import TextEdit from '../components/TextEdit';
import { notify } from '../components/Toast';
import { Checkbox, Empty, Frame, TextInput, pickFiles } from '../components/ui';
import { usePolling } from '../hooks';
import { usePacks } from '../packs';

interface VersionForm {
  name: string;
  displayDate: string;
  changelogHtml: string;
  changelogVisible: boolean;
  cleanInstall: boolean;
}

/** "October 20th, 2026", the style the design uses for release dates. */
function todayLabel(): string {
  const now = new Date();
  const day = now.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${now.toLocaleString('en-US', { month: 'long' })} ${day}${suffix}, ${now.getFullYear()}`;
}

/** Add Version / edit an existing version. */
export default function VersionEditor() {
  const { id, versionId } = useParams();
  const isNew = !versionId || versionId === 'new';
  const navigate = useNavigate();
  const { packs, loaded, refresh } = usePacks();
  const pack = packs.find((p) => p.id === id) ?? null;

  const [release, setRelease] = useState<AdminRelease | null>(null);
  const [form, setForm] = useState<VersionForm | null>(
    isNew ? { name: '', displayDate: todayLabel(), changelogHtml: '', changelogVisible: true, cleanInstall: false } : null,
  );
  const [zip, setZip] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  const loadRelease = useCallback(async () => {
    if (isNew) return;
    try {
      const data = await api.getRelease(versionId!);
      setRelease(data);
      setForm(
        (prev) =>
          prev ?? {
            name: data.name,
            displayDate: data.displayDate,
            changelogHtml: data.changelogHtml,
            changelogVisible: data.changelogVisible,
            cleanInstall: data.cleanInstall,
          },
      );
    } catch (err) {
      notify(errorMessage(err));
      navigate(`/packs/${id}/versions`, { replace: true });
    }
  }, [isNew, versionId, id, navigate]);

  useEffect(() => {
    void loadRelease();
  }, [loadRelease]);
  usePolling(release?.status === 'importing', 1500, loadRelease);

  if (loaded && !pack) return <Navigate to="/" replace />;

  const set = <K extends keyof VersionForm>(key: K, value: VersionForm[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const back = () => navigate(`/packs/${id}/versions${release ? `?selected=${release.id}` : ''}`);

  const chooseZip = async () => {
    const [file] = await pickFiles('.zip,.mrpack');
    if (file) setZip(file);
  };

  const save = async () => {
    if (!id || !form) return;
    if (!form.name.trim()) {
      notify('Give this version a number first.');
      return;
    }
    if (isNew && !zip) {
      notify('Upload the modpack export (.zip or .mrpack) first.');
      return;
    }
    setSaving(true);
    setProgress(0);
    try {
      const uploadId = zip ? await api.uploadFile(zip, setProgress) : null;
      let saved: AdminRelease;
      if (isNew) {
        saved = await api.createRelease(id, { ...form, name: form.name.trim(), uploadId: uploadId! });
      } else {
        saved = await api.updateRelease(versionId!, { ...form, name: form.name.trim() });
        if (uploadId) saved = await api.reimportRelease(versionId!, uploadId);
      }
      await refresh();
      notify(uploadId ? 'Uploaded. The import runs in the background.' : 'Version saved', 'success');
      navigate(`/packs/${id}/versions?selected=${saved.id}`);
    } catch (err) {
      notify(`Couldn't save the version: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
      setProgress(0);
    }
  };

  const sidebar = (
    <PackSidebar
      activeId={id ?? null}
      lock
      actions={{
        left: { label: 'Discard', tone: 'secondary', onClick: back, disabled: saving },
        right: {
          label: saving ? (progress < 100 && zip ? `Uploading ${progress}%` : 'Saving…') : 'Save',
          tone: 'primary',
          onClick: save,
          disabled: saving || !form,
        },
      }}
    />
  );

  if (!form) {
    return (
      <Shell sidebar={sidebar}>
        <Empty>Loading…</Empty>
      </Shell>
    );
  }

  const fileLabel = zip?.name ?? (release ? `Replace ${release.sourceFilename}` : 'Click to Upload File');

  return (
    <Shell sidebar={sidebar}>
      <div className="absolute left-[28px] top-[26px] flex h-[753px] w-[311px] flex-col gap-[14px] overflow-y-auto [scrollbar-width:none]">
        <Frame className="w-[311px] shrink-0 rounded-[15px] px-[18px] pb-[18px] pt-[16px] backdrop-blur-[50px]">
          <button
            type="button"
            onClick={chooseZip}
            disabled={saving}
            title={zip?.name ?? release?.sourceFilename ?? 'CurseForge export (.zip) or Modrinth pack (.mrpack)'}
            className="flex h-[37px] w-[273px] items-center justify-center overflow-hidden rounded-[10px] bg-mm-accent px-[12px] text-[20px] font-semibold leading-none hover:brightness-110"
          >
            <span className="truncate">{fileLabel}</span>
          </button>
          {saving && zip && (
            <div className="mt-[8px] h-[6px] w-[273px] overflow-hidden rounded-full bg-mm-chip">
              <div className="h-full bg-mm-accent transition-[width]" style={{ width: `${progress}%` }} />
            </div>
          )}
          <p className="mt-[8px] text-[14px] leading-[1.25] text-mm-muted">
            {isNew ? 'CurseForge export (.zip) or Modrinth pack (.mrpack).' : 'Only versions that aren’t live yet can have their file replaced.'}
          </p>

          <p className="mt-[16px] text-[20px] font-semibold leading-none">Version #</p>
          <TextInput
            aria-label="Version number"
            value={form.name}
            maxLength={64}
            placeholder="v1.0.0"
            onChange={(e) => set('name', e.target.value)}
            className="mt-[8px] w-[273px]"
          />

          <p className="mt-[24px] text-[20px] font-semibold leading-none">Release Date</p>
          <TextInput
            aria-label="Release date"
            value={form.displayDate}
            maxLength={64}
            onChange={(e) => set('displayDate', e.target.value)}
            className="mt-[8px] w-[273px]"
          />

          <p className="mt-[34px] text-[20px] font-semibold leading-none">Clean Install</p>
          <div className="mt-[8px]">
            <Checkbox label="Clean install" danger size={37} checked={form.cleanInstall} onChange={(v) => set('cleanInstall', v)} />
          </div>
          <p className="mt-[8px] text-[18px] font-light leading-[1.15] text-[#acacac]">
            <span className="text-[red]">WARNING:</span> This option will wipe any previously installed modpack files. Make sure users have any data
            they want to keep backed up before updating!
          </p>

          <label className="mt-[20px] flex cursor-pointer items-center gap-[10px] text-[17px] leading-none text-[#ccc]">
            <Checkbox label="Show changelog in the launcher" checked={form.changelogVisible} onChange={(v) => set('changelogVisible', v)} />
            Show changelog in the launcher
          </label>
        </Frame>

        {release && <ImportStatus release={release} onChange={setRelease} />}
      </div>

      <TextEdit
        key={release?.id ?? 'new'}
        className="absolute left-[371px] top-[26px] h-[729px] w-[1036px]"
        existingHtml={form.changelogHtml}
        handleFormChange={(changelogHtml) => setForm((prev) => (prev ? { ...prev, changelogHtml } : prev))}
      />
    </Shell>
  );
}

/** Import progress, errors, or mods that must be uploaded by hand. */
function ImportStatus({ release, onChange }: { release: AdminRelease; onChange: (r: AdminRelease) => void }) {
  if (release.status === 'ready') return null;
  return (
    <Frame className="w-[311px] shrink-0 rounded-[15px] px-[18px] py-[16px]">
      {release.status === 'importing' && (
        <>
          <p className="text-[20px] font-semibold text-[#8DF4FF]">Importing {Math.round(release.importProgress * 100)}%</p>
          <div className="mt-[8px] h-[6px] overflow-hidden rounded-full bg-mm-chip">
            <div className="h-full bg-[#8DF4FF]" style={{ width: `${Math.round(release.importProgress * 100)}%` }} />
          </div>
          <p className="mt-[8px] truncate text-[15px] text-mm-muted">{release.importMessage}</p>
        </>
      )}
      {release.status === 'failed' && (
        <>
          <p className="text-[20px] font-semibold text-[#ff6161]">Import Failed</p>
          <p className="mt-[6px] text-[16px] leading-[1.25]">{release.error}</p>
          <p className="mt-[8px] text-[15px] text-mm-muted">Choose a new file above and save to try again.</p>
        </>
      )}
      {release.status === 'needs_files' && (
        <>
          <p className="text-[20px] font-semibold text-[#ffb957]">Missing Files ({release.missing.length})</p>
          <p className="mt-[6px] text-[15px] leading-[1.25] text-mm-muted">
            These authors don&apos;t allow other launchers to download their files. Download each one and upload it here.
          </p>
          <div className="mt-[10px] flex flex-col gap-[8px]">
            {release.missing.map((file) => (
              <MissingFileRow key={file.path} release={release} file={file} onChange={onChange} />
            ))}
          </div>
        </>
      )}
    </Frame>
  );
}

function MissingFileRow({ release, file, onChange }: { release: AdminRelease; file: MissingFile; onChange: (r: AdminRelease) => void }) {
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    const [picked] = await pickFiles('.jar,.zip');
    if (!picked) return;
    setBusy(true);
    try {
      const uploadId = await api.uploadFile(picked);
      onChange(await api.resolveMissing(release.id, file.path, uploadId));
    } catch (err) {
      notify(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-[8px] rounded-[10px] bg-mm-surface px-[10px] py-[8px]">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold">{file.projectName}</p>
        {file.pageUrl ? (
          <a href={file.pageUrl} target="_blank" rel="noreferrer" className="block truncate text-[13px] text-[#8DF4FF] underline">
            {file.fileName}
          </a>
        ) : (
          <p className="truncate text-[13px] text-mm-muted">{file.fileName}</p>
        )}
      </div>
      <button
        type="button"
        onClick={upload}
        disabled={busy}
        className="h-[30px] shrink-0 rounded-[8px] bg-mm-accent px-[12px] text-[15px] font-semibold disabled:opacity-60"
      >
        {busy ? '…' : 'Upload'}
      </button>
    </div>
  );
}
