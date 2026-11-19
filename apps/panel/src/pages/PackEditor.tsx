import { PACK_STATUSES, type Media, type PackBody } from '@mmp/schema';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { api, errorMessage, mediaUrl } from '../api';
import PackSidebar from '../components/PackSidebar';
import Shell from '../components/Shell';
import { notify } from '../components/Toast';
import { Checkbox, Empty, Frame, IMAGE_ACCEPT, RemoveButton, STATUS_META, TextInput, pickFiles } from '../components/ui';
import { usePacks } from '../packs';

type ImageField = 'thumbnail' | 'banner' | 'background';

interface PendingShot {
  key: string;
  file: File;
  url: string;
}

/** Edit Details: images, screenshots, status and title. Also used for a new pack. */
export default function PackEditor({ isNew = false }: { isNew?: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { packs, loaded, refresh } = usePacks();
  const pack = isNew ? null : packs.find((p) => p.id === id) ?? null;

  const [form, setForm] = useState<PackBody | null>(null);
  const [pendingImages, setPendingImages] = useState<Partial<Record<ImageField, File>>>({});
  const [shots, setShots] = useState<Media[]>([]);
  const [removedShots, setRemovedShots] = useState<Set<string>>(new Set());
  const [newShots, setNewShots] = useState<PendingShot[]>([]);
  const [saving, setSaving] = useState(false);

  // Load the form once, from the saved pack or a fresh "Untitled Modpack N".
  useEffect(() => {
    if (form || !loaded) return;
    if (isNew) {
      const taken = new Set(packs.map((p) => p.name));
      let n = 1;
      while (taken.has(`Untitled Modpack ${n}`)) n++;
      setForm({ name: `Untitled Modpack ${n}`, status: 'unreleased', thumbnail: null, banner: null, background: null });
    } else if (pack) {
      setForm({ name: pack.name, status: pack.status, thumbnail: pack.thumbnail, banner: pack.banner, background: pack.background });
      api.listScreenshots(pack.id).then(setShots).catch((err) => notify(errorMessage(err)));
    }
  }, [form, loaded, isNew, pack, packs]);

  const previews = useMemo(() => {
    const urls: Partial<Record<ImageField, string>> = {};
    for (const [field, file] of Object.entries(pendingImages)) if (file) urls[field as ImageField] = URL.createObjectURL(file);
    return urls;
  }, [pendingImages]);
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), [previews]);

  if (!isNew && loaded && !pack) return <Navigate to="/" replace />;

  const imageUrl = (field: ImageField) => previews[field] ?? mediaUrl(form?.[field]);
  const set = <K extends keyof PackBody>(key: K, value: PackBody[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const chooseImage = async (field: ImageField) => {
    const [file] = await pickFiles(IMAGE_ACCEPT);
    if (file) setPendingImages((prev) => ({ ...prev, [field]: file }));
  };
  const clearImage = (field: ImageField) => {
    setPendingImages((prev) => ({ ...prev, [field]: undefined }));
    set(field, null);
  };

  const addScreenshots = async () => {
    const files = await pickFiles(IMAGE_ACCEPT, true);
    setNewShots((prev) => [
      ...prev,
      ...files.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, url: URL.createObjectURL(file) })),
    ]);
  };

  const leave = () => navigate(isNew ? '/' : `/packs/${id}`);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      notify('Give the modpack a title first.');
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, name: form.name.trim() };
      for (const [field, file] of Object.entries(pendingImages) as [ImageField, File | undefined][]) {
        if (file) body[field] = (await api.uploadMedia(file, field)).sha256;
      }
      const saved = isNew ? await api.createPack(body) : await api.updatePack(id!, body);
      for (const shotId of removedShots) await api.deleteScreenshot(shotId);
      for (const shot of newShots) await api.uploadMedia(shot.file, 'screenshot', saved.id);
      await refresh();
      notify('Modpack saved', 'success');
      navigate(`/packs/${saved.id}`);
    } catch (err) {
      notify(`Couldn't save the modpack: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!pack || !confirm(`Delete ${pack.name} and all of its versions? This can't be undone.`)) return;
    try {
      await api.deletePack(pack.id);
      await refresh();
      notify('Modpack deleted', 'success');
      navigate('/');
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const visibleShots = [
    ...shots.filter((s) => !removedShots.has(s.id)).map((s) => ({ key: s.id, url: s.url, remove: () => setRemovedShots((prev) => new Set(prev).add(s.id)) })),
    ...newShots.map((s) => ({ key: s.key, url: s.url, remove: () => setNewShots((prev) => prev.filter((p) => p.key !== s.key)) })),
  ];
  const placeholders = Math.max(0, 3 - visibleShots.length);

  const sidebar = (
    <PackSidebar
      activeId={isNew ? 'new' : id!}
      lock
      draft={form ? { name: form.name, status: form.status, thumbnail: imageUrl('thumbnail') } : undefined}
      actions={{
        left: { label: 'Discard', tone: 'secondary', onClick: leave, disabled: saving },
        right: { label: saving ? 'Saving…' : 'Save', tone: 'primary', onClick: save, disabled: saving || !form },
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

  const logo = imageUrl('thumbnail');
  const banner = imageUrl('banner');
  const background = imageUrl('background');

  return (
    <Shell sidebar={sidebar} background={background}>
      {/* Modpack logo */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => chooseImage('thumbnail')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && chooseImage('thumbnail')}
        className="group absolute left-[27px] top-[19px] size-[150px] cursor-pointer overflow-hidden rounded-[25px] border-2 border-mm-frame bg-mm-bg text-left backdrop-blur-[50px]"
      >
        {logo ? (
          <>
            <img src={logo} alt="Modpack logo" className="size-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[18px] font-semibold opacity-0 transition group-hover:opacity-100">
              Replace
            </span>
            <RemoveButton label="Remove logo" onClick={() => clearImage('thumbnail')} className="absolute right-[8px] top-[8px]" />
          </>
        ) : (
          <span className="absolute left-[16px] top-[13px] text-[20px] font-semibold leading-[1.22]">
            Upload
            <br />
            Modpack
            <br />
            Logo
          </span>
        )}
      </div>

      {/* Title image */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => chooseImage('banner')}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && chooseImage('banner')}
        className="group absolute left-[205px] top-[19px] h-[148px] cursor-pointer w-[694px] overflow-hidden rounded-[25px] border-2 border-mm-frame bg-mm-bg text-left backdrop-blur-[50px]"
      >
        {banner ? (
          <>
            <img src={banner} alt="Title image" className="size-full object-contain p-[10px]" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[20px] font-semibold opacity-0 transition group-hover:opacity-100">
              Replace Title Image
            </span>
            <RemoveButton label="Remove title image" onClick={() => clearImage('banner')} className="absolute right-[10px] top-[10px]" />
          </>
        ) : (
          <>
            <span className="absolute left-[20px] top-[17px] text-[20px] font-semibold leading-none">Upload Title Image</span>
            <span className="absolute bottom-[16px] left-[20px] text-[15px] text-mm-muted">
              Shown above the Play button. Without one the launcher shows the title as text.
            </span>
          </>
        )}
      </div>

      {/* Background */}
      <div className="absolute left-[1123px] top-[21px] flex h-[54px] w-[279px] items-center overflow-hidden rounded-[10px] border-2 border-mm-frame bg-mm-bg backdrop-blur-[50px]">
        <button type="button" onClick={() => chooseImage('background')} className="h-full flex-1 text-[20px] font-semibold leading-none hover:text-mm-accent">
          {background ? 'Change Background' : 'Upload Background Image'}
        </button>
        {background && <RemoveButton label="Remove background" onClick={() => clearImage('background')} className="mr-[10px]" />}
      </div>

      {/* Screenshots */}
      <Frame className="absolute left-[27px] top-[193px] h-[240px] w-[1375px] rounded-[25px] backdrop-blur-[50px]">
        <p className="absolute left-[18px] top-[14px] text-[20px] font-semibold leading-none">Upload Screenshots</p>
        <p className="absolute right-[20px] top-[16px] text-[15px] text-mm-muted">
          {visibleShots.length === 0 ? 'None yet: the launcher shows the server-wide screenshots from Settings.' : 'Shown in the launcher in this order.'}
        </p>
        <div className="absolute bottom-[17px] left-[16px] right-[16px] top-[49px] flex gap-[12px] overflow-x-auto">
          {visibleShots.map((shot) => (
            <div key={shot.key} className="group relative h-[172px] w-[306px] shrink-0 overflow-hidden rounded-[25px] bg-mm-surface">
              <img src={shot.url} alt="" className="size-full object-cover" />
              <RemoveButton label="Remove screenshot" onClick={shot.remove} className="absolute right-[12px] top-[12px] opacity-0 group-hover:opacity-100" />
            </div>
          ))}
          {Array.from({ length: placeholders }, (_, i) => (
            <button
              key={`placeholder-${i}`}
              type="button"
              aria-label="Add screenshots"
              onClick={addScreenshots}
              className="h-[172px] w-[306px] shrink-0 rounded-[25px] bg-mm-surface backdrop-blur-[50px]"
            />
          ))}
          <button type="button" onClick={addScreenshots} aria-label="Add screenshots" className="group shrink-0">
            <img src="/ui/add-screenshot.svg" alt="" width={306} height={172} className="transition group-hover:brightness-125" />
          </button>
        </div>
      </Frame>

      {/* Status and title */}
      <Frame className="absolute left-[27px] top-[474px] h-[306px] w-[1375px] rounded-[25px] backdrop-blur-[50px]">
        <div className="absolute left-[19px] top-[17px] h-[157px] w-[170px] rounded-[25px] bg-mm-surface">
          <p className="absolute left-[17px] top-[14px] text-[20px] font-semibold leading-none">Status</p>
          {PACK_STATUSES.map((status, i) => {
            const meta = STATUS_META[status];
            return (
              <div key={status} className="absolute left-[17px] flex items-center gap-[10px]" style={{ top: 48 + i * 33 }}>
                <button
                  type="button"
                  onClick={() => set('status', status)}
                  className={`flex h-[28px] w-[107px] items-center justify-center rounded-[5px] text-[15px] font-semibold leading-none ${meta.color}`}
                >
                  {meta.label}
                </button>
                <Checkbox label={meta.label} checked={form.status === status} onChange={() => set('status', status)} />
              </div>
            );
          })}
        </div>

        <div className="absolute left-[211px] top-[15px] h-[94px] w-[306px] rounded-[25px] bg-mm-surface">
          <p className="absolute left-[17px] top-[14px] text-[20px] font-semibold leading-none">Modpack Title</p>
          <TextInput
            aria-label="Modpack title"
            value={form.name}
            maxLength={80}
            onChange={(e) => set('name', e.target.value)}
            className="absolute left-[17px] top-[42px] w-[273px]"
          />
        </div>

        <div className="absolute left-[541px] top-[15px] w-[560px] text-[16px] leading-[1.35] text-mm-muted">
          <p>
            <span className="font-semibold text-white">Released</span> packs show for every player.{' '}
            <span className="font-semibold text-white">Development</span> packs only show for players on the Manage Access list.{' '}
            <span className="font-semibold text-white">Not Released</span> packs are hidden from the launcher.
          </p>
          {pack && <p className="mt-[10px]">Launcher ID: <span className="text-white">{pack.slug}</span></p>}
        </div>

        {pack && (
          <button
            type="button"
            onClick={remove}
            className="absolute bottom-[17px] right-[19px] h-[37px] rounded-[10px] border border-[#7a2a2a] px-[18px] text-[18px] font-semibold text-[#ff8a8a] hover:bg-[#5a1f24] hover:text-white"
          >
            Delete Modpack
          </button>
        )}
      </Frame>
    </Shell>
  );
}
