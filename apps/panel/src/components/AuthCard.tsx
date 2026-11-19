import type { FormEvent, ReactNode } from 'react';

/** Layout shared by the sign-in and first-run setup pages. */
export function AuthCard({
  heading,
  subheading,
  onSubmit,
  children,
}: {
  heading: string;
  subheading: string;
  onSubmit: (e: FormEvent) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex size-full flex-col items-center justify-center">
      <div className="flex h-[76px] items-center rounded-[100px] bg-mm-surface pl-[15px] pr-[28px]">
        <img src="/ui/mmpanel-logo.png" alt="" width={50} height={50} className="size-[50px] rounded-full object-cover" />
        <p className="ml-[8px] whitespace-nowrap text-[30px] font-semibold leading-none">Modpack Management Panel</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="mt-[36px] flex w-[520px] flex-col rounded-[25px] border-2 border-mm-frame bg-mm-surface px-[36px] pb-[32px] pt-[28px]"
      >
        <h1 className="text-[30px] font-bold leading-none">{heading}</h1>
        <p className="mt-[10px] text-[18px] text-mm-muted">{subheading}</p>
        <div className="mt-[26px] flex flex-col gap-[18px]">{children}</div>
      </form>
    </div>
  );
}

export function AuthField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-[8px]">
      <span className="text-[20px] font-semibold leading-none">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="h-[44px] rounded-[2px] border border-mm-line bg-mm-bg px-[12px] text-[19px] text-white outline-none focus:border-mm-accent"
      />
    </label>
  );
}

export function AuthSubmit({ text, disabled }: { text: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-[8px] h-[46px] rounded-[10px] bg-mm-accent text-[20px] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
    >
      {text}
    </button>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return <p className="text-[17px] text-[#ff8a8a]">{children}</p>;
}
