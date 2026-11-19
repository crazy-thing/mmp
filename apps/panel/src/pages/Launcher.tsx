import { LAUNCHER_DOWNLOADS, connectLink, type AdminSettings } from '@mmp/schema';
import { Copy, Rocket } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api';
import Shell from '../components/Shell';
import { notify } from '../components/Toast';
import { Empty, Frame } from '../components/ui';

function Section({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Frame className={`rounded-[25px] px-[24px] pb-[24px] pt-[20px] ${className}`}>
      <p className="mb-[18px] text-[22px] font-bold leading-none">{title}</p>
      {children}
    </Frame>
  );
}

function CopyField({ label, hint, value, multiline = false }: { label: string; hint?: string; value: string; multiline?: boolean }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      notify(`${label} copied`, 'success');
    } catch {
      notify("Couldn't copy. Select the text and copy it yourself.");
    }
  };
  return (
    <div className="flex flex-col">
      <span className="text-[19px] font-semibold leading-none">{label}</span>
      <div className="mt-[9px] flex items-stretch gap-[8px]">
        {multiline ? (
          <textarea
            readOnly
            value={value}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 resize-none rounded-[2px] border border-mm-line bg-transparent px-[10px] py-[8px] font-mono text-[14px] text-[#ddd] outline-none"
          />
        ) : (
          <input
            readOnly
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            className="h-[37px] min-w-0 flex-1 rounded-[2px] border border-mm-line bg-transparent px-[10px] text-[17px] text-white outline-none"
          />
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          title="Copy"
          className="flex w-[44px] shrink-0 items-center justify-center rounded-[6px] bg-mm-chip hover:brightness-125"
        >
          <Copy size={18} />
        </button>
      </div>
      {hint && <span className="mt-[6px] text-[15px] leading-[1.3] text-mm-muted">{hint}</span>}
    </div>
  );
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The links creators hand out to players, and the launcher downloads. */
export default function Launcher() {
  const [current, setCurrent] = useState<AdminSettings | null>(null);

  useEffect(() => {
    api.getSettings().then(setCurrent).catch((err) => notify(errorMessage(err)));
  }, []);

  const sidebar = (
    <div className="relative h-[106px] w-[368px] shrink-0 rounded-[25px] bg-mm-frame">
      <div className="absolute left-[23px] top-[18px] flex size-[70px] items-center justify-center rounded-[10px] border-2 border-mm-chip bg-mm-raised">
        <Rocket size={36} />
      </div>
      <p className="absolute left-[109px] top-[24px] text-[20px] font-bold leading-[1.2]">Launcher</p>
      <p className="absolute left-[109px] top-[56px] w-[240px] truncate text-[15px] text-[#bbb]">Share with players</p>
    </div>
  );

  const server = current?.publicUrl ?? '';
  const joinUrl = server ? `${server}/join` : '';
  const name = current?.communityName ?? '';

  return (
    <Shell sidebar={sidebar}>
      {!current ? (
        <Empty>Loading…</Empty>
      ) : (
        <div className="size-full overflow-y-auto p-[28px]">
          <div className="grid grid-cols-2 gap-[24px]">
            <Section title="Share With Players" className="col-span-2">
              {!server ? (
                <p className="text-[17px] leading-[1.45] text-[#ccc]">
                  Set the Public URL in <Link to="/settings" className="text-mm-accent underline">Settings</Link> first. Every link
                  here is built from it.
                </p>
              ) : (
                <div className="flex flex-col gap-[20px]">
                  <CopyField
                    label="Join page"
                    hint="Post this in Discord or on your website. It has the download and an Open in launcher button."
                    value={joinUrl}
                  />
                  <CopyField
                    label="Website button"
                    hint="HTML for a Play button on your own site."
                    multiline
                    value={`<a href="${escapeHtml(joinUrl)}" style="display:inline-block;padding:12px 22px;border-radius:10px;background:#1eb298;color:#fff;font-weight:600;text-decoration:none">Play ${escapeHtml(name)}</a>`}
                  />
                  <CopyField
                    label="Server address"
                    hint="What players type into the launcher if they add the server by hand."
                    value={server}
                  />
                  <CopyField
                    label="Direct launcher link"
                    hint="Opens the launcher and offers to add this server. Discord won't make these clickable, so use the join page there."
                    value={connectLink(server)}
                  />
                  <a href={joinUrl} target="_blank" rel="noreferrer" className="text-[17px] text-mm-accent underline">
                    Preview the join page
                  </a>
                </div>
              )}
            </Section>

            <Section title="Launcher Downloads" className="col-span-2">
              {LAUNCHER_DOWNLOADS ? (
                <div className="grid grid-cols-3 gap-[16px]">
                  <CopyField label="Windows" value={LAUNCHER_DOWNLOADS.windows} />
                  <CopyField label="macOS" value={LAUNCHER_DOWNLOADS.mac} />
                  <CopyField label="Linux" value={LAUNCHER_DOWNLOADS.linux} />
                </div>
              ) : (
                <p className="text-[17px] leading-[1.45] text-[#ccc]">
                  Launcher downloads aren't published yet. When they are, they'll appear here and on your join page
                  automatically. Players who already have the launcher can use the join page now.
                </p>
              )}
            </Section>
          </div>
        </div>
      )}
    </Shell>
  );
}
