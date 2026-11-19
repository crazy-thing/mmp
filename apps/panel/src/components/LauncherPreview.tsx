import type { AdminPack, AdminRelease } from '@mmp/schema';
import { useState } from 'react';
import { mediaUrl } from '../api';

const SCALE = 1431 / 1920;

/**
 * The pack as players will see it in the launcher (single-pack layout, from
 * launcher/src/renderer/components/PackDetail.tsx), drawn at 1920×1080 and scaled into the main panel.
 * Uses the saved pack, the release on the Current channel and the changelogs players can see.
 */
export default function LauncherPreview({
  pack,
  releases,
  screenshots,
}: {
  pack: AdminPack;
  releases: AdminRelease[];
  screenshots: { id: string; url: string }[];
}) {
  const [shot, setShot] = useState(0);
  const background = mediaUrl(pack.background);
  const banner = mediaUrl(pack.banner);
  const current = releases.find((r) => r.id === pack.channels.stable && r.status === 'ready') ?? null;
  const changelogs = releases.filter((r) => r.status === 'ready' && r.changelogVisible);

  return (
    <div className="relative size-full overflow-hidden">
      <div
        className="absolute left-0 top-0 h-[1080px] w-[1920px] origin-top-left overflow-hidden bg-mm-bg"
        style={{ transform: `scale(${SCALE})` }}
      >
        {background && <img src={background} alt="" className="absolute inset-0 size-full max-w-none object-cover" />}

        <div className="absolute left-[38px] top-[32px] h-[127px] w-[838px]">
          {banner ? (
            <img src={banner} alt={pack.name} className="size-full max-w-none object-contain object-left" />
          ) : (
            <p className="text-[64px] font-black uppercase leading-none text-white [text-shadow:0_0_75px_black]">{pack.name}</p>
          )}
        </div>

        <img src="/ui/launcher/gear.svg" alt="" width={75} height={75} className="absolute right-[36px] top-[32px] max-w-none" />

        {current ? (
          <div className="absolute left-[38px] top-[189px] h-[118px] w-[498px] rounded-[25px] bg-[rgba(0,0,0,0.12)] backdrop-blur-[50px]">
            <div className="absolute left-[14px] top-[16px] flex h-[86px] w-[230px] items-center justify-center rounded-[11px] bg-[#3eb633] text-[36px] font-black uppercase leading-none text-white shadow-[0_0_12px_rgba(0,0,0,0.25)] [text-shadow:0_0_75px_black]">
              Play
            </div>
            <img src="/ui/launcher/options.svg" alt="" width={69} height={110} className="absolute left-[246px] top-[4px] max-w-none" />
            <p className="absolute right-[28px] top-[51px] text-[20px] uppercase leading-[0.82] text-[#bbb]">Never played</p>
          </div>
        ) : (
          <div className="absolute left-[38px] top-[189px]">
            <div className="h-[18px] w-[620px] overflow-hidden rounded-[25px] bg-[rgba(0,0,0,0.12)] backdrop-blur-[50px]" />
            <div className="mt-[10px] flex h-[53px] w-[348px] items-center rounded-[12px] bg-[rgba(0,0,0,0.12)] px-[12px] backdrop-blur-[50px]">
              <span className="text-[25px] text-white [text-shadow:0_0_75px_black]">Nothing published yet</span>
            </div>
          </div>
        )}

        {screenshots.length > 0 && (
          <div className="absolute left-0 right-0 top-[373px] h-[252px]">
            <div className="absolute bottom-0 left-[108px] right-[106px] top-0 overflow-hidden">
              <div className="flex h-full gap-[12px] transition-transform" style={{ transform: `translateX(-${shot * 460}px)` }}>
                {screenshots.map((item) => (
                  <img key={item.id} src={item.url} alt="" className="h-[252px] w-[448px] max-w-none shrink-0 rounded-[25px] object-cover" />
                ))}
              </div>
            </div>
            <button type="button" className="absolute left-[38px] top-0" onClick={() => setShot((n) => Math.max(0, n - 1))} aria-label="Previous screenshots">
              <img src="/ui/launcher/arrow-left.svg" alt="" width={45} height={252} className="max-w-none" />
            </button>
            <button
              type="button"
              className="absolute right-[36px] top-0"
              onClick={() => setShot((n) => Math.min(Math.max(0, screenshots.length - 1), n + 1))}
              aria-label="Next screenshots"
            >
              <img src="/ui/launcher/arrow-right.svg" alt="" width={45} height={252} className="max-w-none" />
            </button>
          </div>
        )}

        <div className={`absolute bottom-0 left-[38px] right-[37px] overflow-y-auto ${screenshots.length > 0 ? 'top-[662px]' : 'top-[373px]'}`}>
          {changelogs.map((entry) => (
            <article
              key={entry.id}
              className="mb-[20px] min-h-[434px] overflow-hidden rounded-[25px] bg-[rgba(0,0,0,0.12)] pb-[20px] text-white backdrop-blur-[50px] [text-shadow:0_0_75px_black]"
            >
              <div className="flex items-start justify-between px-[15px] pt-[9px] text-[22px] font-medium">
                <span>{entry.name}</span>
                <span>{entry.displayDate}</span>
              </div>
              {/* Sanitised by the server when saved. */}
              <div className="changelog px-[29px] pt-[16px]" dangerouslySetInnerHTML={{ __html: entry.changelogHtml }} />
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
