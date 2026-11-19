import type { AdminSettings, Media, SettingsBody } from '@mmp/schema';
import { Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import ServerStatus from '../components/ServerStatus';
import Shell, { setPanelAddress } from '../components/Shell';
import { notify } from '../components/Toast';
import { CardButton, Checkbox, Empty, Frame, IMAGE_ACCEPT, RemoveButton, TextInput, pickFiles } from '../components/ui';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col">
      <span className="text-[20px] font-semibold leading-none">{label}</span>
      <div className="mt-[10px]">{children}</div>
      {hint && <span className="mt-[6px] text-[15px] leading-[1.3] text-mm-muted">{hint}</span>}
    </label>
  );
}

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Frame className={`rounded-[25px] px-[24px] pb-[24px] pt-[20px] ${className}`}>
      <p className="mb-[20px] text-[22px] font-bold leading-none">{title}</p>
      {children}
    </Frame>
  );
}

/** Server settings, password and the server-wide screenshots. */
export default function Settings() {
  const { user } = useAuth();
  const [current, setCurrent] = useState<AdminSettings | null>(null);
  const [communityName, setCommunityName] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [curseforgeApiKey, setCurseforgeApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [shots, setShots] = useState<Media[]>([]);
  const [removedShots, setRemovedShots] = useState<Set<string>>(new Set());
  const [newShots, setNewShots] = useState<{ key: string; file: File; url: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [s, list] = await Promise.all([api.getSettings(), api.listScreenshots()]);
    setCurrent(s);
    setCommunityName(s.communityName);
    setPublicUrl(s.publicUrl);
    setCurseforgeApiKey('');
    setClearKey(false);
    setCurrentPassword('');
    setNewPassword('');
    setShots(list);
    setRemovedShots(new Set());
    setNewShots([]);
  };

  useEffect(() => {
    load().catch((err) => notify(errorMessage(err)));
  }, []);

  const save = async () => {
    if (newPassword && !currentPassword) {
      notify('Enter your current password to change it.');
      return;
    }
    setSaving(true);
    try {
      const body: SettingsBody = { communityName: communityName.trim(), publicUrl: publicUrl.trim().replace(/\/+$/, '') };
      if (clearKey) body.curseforgeApiKey = '';
      else if (curseforgeApiKey.trim()) body.curseforgeApiKey = curseforgeApiKey.trim();
      const saved = await api.updateSettings(body);
      setPanelAddress(saved.publicUrl);
      for (const id of removedShots) await api.deleteScreenshot(id);
      for (const shot of newShots) await api.uploadMedia(shot.file, 'screenshot');
      if (newPassword) await api.changePassword(currentPassword, newPassword);
      await load();
      notify('Settings saved', 'success');
    } catch (err) {
      notify(`Couldn't save settings: ${errorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const discard = () => {
    load().catch((err) => notify(errorMessage(err)));
  };

  const addShots = async () => {
    const files = await pickFiles(IMAGE_ACCEPT, true);
    setNewShots((prev) => [...prev, ...files.map((file) => ({ key: `${file.name}-${Math.random()}`, file, url: URL.createObjectURL(file) }))]);
  };

  const visibleShots = [
    ...shots.filter((s) => !removedShots.has(s.id)).map((s) => ({ key: s.id, url: s.url, remove: () => setRemovedShots((p) => new Set(p).add(s.id)) })),
    ...newShots.map((s) => ({ key: s.key, url: s.url, remove: () => setNewShots((p) => p.filter((x) => x.key !== s.key)) })),
  ];

  const sidebar = (
    <div className="relative h-[158px] w-[368px] shrink-0 rounded-[25px] bg-mm-frame">
      <div className="absolute left-[23px] top-[18px] flex size-[70px] items-center justify-center rounded-[10px] border-2 border-mm-chip bg-mm-raised">
        <SettingsIcon size={36} />
      </div>
      <p className="absolute left-[109px] top-[24px] text-[20px] font-bold leading-[1.2]">Server Settings</p>
      <p className="absolute left-[109px] top-[56px] w-[240px] truncate text-[15px] text-[#bbb]">{current?.communityName ?? ''}</p>
      <div className="absolute left-[20px] top-[109px] flex gap-[9px]">
        <CardButton tone="secondary" onClick={discard} disabled={saving || !current}>
          Discard
        </CardButton>
        <CardButton tone="primary" onClick={save} disabled={saving || !current}>
          {saving ? 'Saving…' : 'Save'}
        </CardButton>
      </div>
    </div>
  );

  return (
    <Shell sidebar={sidebar}>
      {!current ? (
        <Empty>Loading…</Empty>
      ) : (
        <div className="size-full overflow-y-auto p-[28px]">
          <div className="grid grid-cols-2 gap-[24px]">
            <Section title="Server Status" className="col-span-2">
              <ServerStatus />
            </Section>

            <Section title="Server">
              <div className="flex flex-col gap-[22px]">
                <Field label="Community Name" hint="Shown in the launcher.">
                  <TextInput className="w-full" value={communityName} maxLength={64} onChange={(e) => setCommunityName(e.target.value)} />
                </Field>
                <Field label="Public URL" hint="The MM Panel Address players enter in the launcher, e.g. https://packs.example.com">
                  <TextInput className="w-full" value={publicUrl} placeholder="https://" onChange={(e) => setPublicUrl(e.target.value)} />
                </Field>
                <Field label="CurseForge API Key" hint="Needed to import CurseForge exports. Stays on this server; launchers never see it.">
                  <TextInput
                    className="w-full"
                    type="password"
                    autoComplete="off"
                    value={curseforgeApiKey}
                    disabled={clearKey}
                    placeholder={current.hasCurseforgeApiKey ? 'Saved. Leave blank to keep it.' : 'Not set'}
                    onChange={(e) => setCurseforgeApiKey(e.target.value)}
                  />
                </Field>
                {current.hasCurseforgeApiKey && (
                  <label className="-mt-[8px] flex cursor-pointer items-center gap-[10px] text-[17px] text-[#ccc]">
                    <Checkbox label="Remove the saved key" checked={clearKey} onChange={setClearKey} />
                    Remove the saved key
                  </label>
                )}
              </div>
            </Section>

            <Section title="Your Account">
              <div className="flex flex-col gap-[22px]">
                <p className="text-[17px] text-[#bbb]">
                  Signed in as <span className="font-semibold text-white">{user?.username}</span> ({user?.role})
                </p>
                <Field label="Current Password">
                  <TextInput
                    className="w-full"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </Field>
                <Field label="New Password" hint="At least 10 characters. Signs out your other devices.">
                  <TextInput
                    className="w-full"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section title="Website Screenshots" className="col-span-2">
              <p className="-mt-[10px] mb-[16px] text-[15px] text-mm-muted">
                Shown on the website, and in the launcher for any modpack without its own screenshots.
              </p>
              <div className="flex flex-wrap gap-[12px]">
                {visibleShots.map((shot) => (
                  <div key={shot.key} className="group relative h-[172px] w-[306px] overflow-hidden rounded-[25px] bg-mm-surface">
                    <img src={shot.url} alt="" className="size-full object-cover" />
                    <RemoveButton label="Remove screenshot" onClick={shot.remove} className="absolute right-[12px] top-[12px] opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
                <button type="button" onClick={addShots} aria-label="Add screenshots" className="group">
                  <img src="/ui/add-screenshot.svg" alt="" width={306} height={172} className="transition group-hover:brightness-125" />
                </button>
              </div>
            </Section>
          </div>
        </div>
      )}
    </Shell>
  );
}
