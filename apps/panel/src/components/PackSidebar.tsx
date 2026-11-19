import type { AdminPack, PackStatus } from '@mmp/schema';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { mediaUrl } from '../api';
import { usePacks } from '../packs';
import { CardButton, StatusBadge } from './ui';

export interface CardAction {
  label: ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'secondary' | 'selected';
  disabled?: boolean;
}

/** Long names fade out at the card edge instead of being cut with an ellipsis. */
function FadingName({ children }: { children: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [children]);
  return (
    <p
      ref={ref}
      title={children}
      className="w-[245px] overflow-hidden whitespace-nowrap text-[20px] font-bold leading-[1.2]"
      style={overflows ? { maskImage: 'linear-gradient(90deg, #000 68%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, #000 68%, transparent)' } : undefined}
    >
      {children}
    </p>
  );
}

export function PackCard({
  name,
  status,
  thumbnail,
  selected,
  dimmed,
  showBadge,
  left,
  right,
  onSelect,
}: {
  name: string;
  status: PackStatus | null;
  thumbnail: string | null;
  selected: boolean;
  dimmed?: boolean;
  /** Released packs don't get a chip on the dashboard; while editing the chip always shows. */
  showBadge?: boolean;
  left: CardAction;
  right: CardAction;
  onSelect?: () => void;
}) {
  return (
    <div
      className={`relative h-[158px] w-[368px] shrink-0 overflow-hidden rounded-[25px] transition-colors ${
        selected ? 'bg-mm-frame' : 'bg-mm-surface hover:bg-[#202027]'
      } ${onSelect && !selected ? 'cursor-pointer' : ''}`}
      onClick={onSelect}
    >
      <div className="absolute left-[23px] top-[18px] size-[70px] overflow-hidden rounded-[10px] border-2 border-mm-chip bg-mm-raised">
        {thumbnail && <img src={thumbnail} alt="" className="size-full rounded-[8px] object-cover" />}
      </div>
      <div className="absolute left-[109px] top-[24px]">
        <FadingName>{name || 'Untitled Modpack'}</FadingName>
      </div>
      {status && (showBadge || status !== 'released') && (
        <div className="absolute left-[109px] top-[56px]">
          <StatusBadge status={status} />
        </div>
      )}
      {status === null && (
        <span className="absolute left-[109px] top-[56px] flex h-[20px] w-[52px] items-center justify-center rounded-[5px] bg-mm-off text-[15px] font-semibold leading-none">
          N/A
        </span>
      )}
      <div className="absolute left-[20px] top-[109px] flex gap-[9px]" onClick={(e) => e.stopPropagation()}>
        <CardButton tone={left.tone ?? (selected ? 'selected' : 'idle')} onClick={left.onClick} disabled={left.disabled}>
          {left.label}
        </CardButton>
        <CardButton tone={right.tone ?? (selected ? 'selected' : 'idle')} onClick={right.onClick} disabled={right.disabled}>
          {right.label}
        </CardButton>
      </div>
      {dimmed && <div className="absolute inset-0 cursor-not-allowed bg-mm-bg/60" onClick={(e) => e.stopPropagation()} />}
    </div>
  );
}

export function AddCard({ onClick, dimmed, label = 'Add modpack' }: { onClick: () => void; dimmed?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={dimmed ? undefined : onClick}
      aria-label={label}
      title={label}
      className="group relative flex h-[63px] w-[368px] shrink-0 items-center justify-center overflow-hidden rounded-[25px] bg-mm-surface"
    >
      <img src="/ui/circle-plus.svg" alt="" width={80} height={80} className="transition-transform group-hover:scale-110" />
      {dimmed && <span className="absolute inset-0 cursor-not-allowed bg-mm-bg/60" />}
    </button>
  );
}

export interface DraftPack {
  name: string;
  status: PackStatus | null;
  thumbnail: string | null;
}

/**
 * The pack list. The active card can swap its two buttons (Save/Discard, Go Back/Add Version);
 * while a form is open the other cards are dimmed so unsaved work isn't lost by a stray click.
 */
export default function PackSidebar({
  activeId,
  actions,
  draft,
  lock = false,
}: {
  /** A pack id, or "new" for a pack that hasn't been saved yet. */
  activeId: string | null;
  actions?: { left: CardAction; right: CardAction };
  /** Live values from the edit form, shown on the active card. */
  draft?: DraftPack;
  lock?: boolean;
}) {
  const { packs } = usePacks();
  const navigate = useNavigate();

  const cardFor = (pack: AdminPack) => {
    const active = pack.id === activeId;
    return (
      <PackCard
        key={pack.id}
        name={active && draft ? draft.name : pack.name}
        status={active && draft ? draft.status : pack.status}
        thumbnail={active && draft ? draft.thumbnail : mediaUrl(pack.thumbnail)}
        selected={active}
        dimmed={lock && !active}
        showBadge={active && !!draft}
        onSelect={active ? undefined : () => navigate(`/packs/${pack.id}`)}
        left={active && actions ? actions.left : { label: 'Edit Details', onClick: () => navigate(`/packs/${pack.id}/edit`) }}
        right={active && actions ? actions.right : { label: 'Versions', onClick: () => navigate(`/packs/${pack.id}/versions`) }}
      />
    );
  };

  return (
    <>
      {activeId === 'new' && draft && actions && (
        <PackCard
          name={draft.name}
          status={draft.status}
          thumbnail={draft.thumbnail}
          selected
          showBadge
          left={actions.left}
          right={actions.right}
        />
      )}
      {packs.map(cardFor)}
      <AddCard onClick={() => navigate('/packs/new')} dimmed={lock} />
    </>
  );
}
