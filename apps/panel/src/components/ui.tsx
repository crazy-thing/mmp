import type { PackStatus } from '@mmp/schema';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/** Framed box used for every section in the main area (Figma "box"). */
export function Frame({ className = '', children }: { className?: string; children?: ReactNode }) {
  const position = /(^|\s)absolute(\s|$)/.test(className) ? '' : 'relative';
  return <div className={`${position} overflow-hidden border-2 border-mm-frame bg-mm-bg ${className}`}>{children}</div>;
}

/** Text field: 37px tall, 1px #464646 border, as in the Figma forms. */
export function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-[37px] rounded-[2px] border border-mm-line bg-transparent px-[10px] text-[18px] text-white outline-none placeholder:text-[#555] focus:border-mm-accent disabled:opacity-50 ${className}`}
    />
  );
}

export function Checkbox({
  checked,
  onChange,
  size = 20,
  danger = false,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  size?: number;
  danger?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-[2px] border bg-mm-bg ${danger ? 'border-[red]' : 'border-mm-line'}`}
      style={{ width: size, height: size }}
    >
      {checked && (
        <img
          src="/ui/check.svg"
          alt=""
          width={20}
          height={20}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={size > 20 ? { width: size - 10, height: size - 10 } : { width: size, height: size }}
        />
      )}
    </button>
  );
}

export const STATUS_META: Record<PackStatus, { label: string; badge: string; color: string }> = {
  released: { label: 'Released', badge: 'Released', color: 'bg-mm-released' },
  dev: { label: 'Development', badge: 'Dev', color: 'bg-mm-dev' },
  unreleased: { label: 'Not Released', badge: 'N/A', color: 'bg-mm-off' },
};

/** The small status chip under a pack name. */
export function StatusBadge({ status }: { status: PackStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex h-[20px] min-w-[52px] items-center justify-center rounded-[5px] px-[10px] text-[15px] font-semibold leading-none text-white ${meta.color}`}
      title={meta.label}
    >
      {meta.badge}
    </span>
  );
}

type CardButtonTone = 'selected' | 'idle' | 'primary' | 'secondary' | 'danger';

const TONES: Record<CardButtonTone, string> = {
  selected: 'bg-mm-select-btn text-white hover:brightness-110',
  idle: 'bg-mm-chip text-mm-muted hover:text-white',
  primary: 'bg-mm-accent text-white hover:brightness-110',
  secondary: 'bg-mm-chip text-white hover:brightness-125',
  danger: 'bg-[#5a1f24] text-white hover:brightness-125',
};

/** 159×31 button on a sidebar card. */
export function CardButton({
  tone,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone: CardButtonTone }) {
  return (
    <button
      type="button"
      {...props}
      className={`flex h-[31px] w-[159px] items-center justify-center overflow-hidden whitespace-nowrap rounded-[10px] text-[20px] font-semibold leading-none transition disabled:opacity-60 ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** "Wow, such empty!" */
export function Empty({ children = 'Wow, such empty!' }: { children?: ReactNode }) {
  return (
    <div className="flex size-full items-center justify-center px-[40px] text-center text-[20px] leading-[1.3] text-[#6b6b6b]">
      <div>{children}</div>
    </div>
  );
}

/** Small round × used to clear an image. */
export function RemoveButton({ onClick, label, className = '' }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex size-[30px] items-center justify-center rounded-full bg-black/70 text-[18px] leading-none text-white hover:bg-[#a33] ${className}`}
    >
      ×
    </button>
  );
}

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** Opens a file picker without a visible <input>. */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}
