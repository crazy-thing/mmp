import { Bug, Rocket, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { api } from '../api';
import { useAuth } from '../auth';
import { notify } from './Toast';

// ---------- panel address (footer) ----------

let cachedAddress: string | null = null;
const addressListeners = new Set<(url: string) => void>();

/** Lets the settings page update the footer right after saving. */
export function setPanelAddress(url: string): void {
  cachedAddress = url;
  for (const listener of addressListeners) listener(url);
}

function usePanelAddress(): string | null {
  const [address, setAddress] = useState(cachedAddress);
  useEffect(() => {
    addressListeners.add(setAddress);
    if (cachedAddress === null) {
      api.getSettings().then((s) => setPanelAddress(s.publicUrl)).catch(() => {});
    }
    return () => {
      addressListeners.delete(setAddress);
    };
  }, []);
  return address;
}

// ---------- nav ----------

const NAV = [
  { to: '/', label: 'Dashboard', icon: <img src="/ui/nav-home.svg" alt="" width={19} height={19} />, end: false },
  { to: '/access', label: 'Manage Access', icon: <img src="/ui/nav-user.svg" alt="" width={16} height={19} />, end: false },
  { to: '/launcher', label: 'Launcher', icon: <Rocket size={19} strokeWidth={2.5} />, end: false },
  { to: '/reports', label: 'Bug Reports', icon: <Bug size={19} strokeWidth={2.5} />, end: false },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon size={19} strokeWidth={2.5} />, end: false },
];

/** The dashboard covers the pack screens, so it stays lit for /packs/... too. */
const isDashboard = (path: string) => path === '/' || path.startsWith('/packs');

function NavBar() {
  const { pathname } = useLocation();
  return (
    <nav className="absolute left-[41px] top-[24px] flex h-[76px] items-center rounded-[100px] bg-mm-surface pl-[15px] pr-[18px]">
      <img src="/ui/mmpanel-logo.png" alt="" width={50} height={50} className="size-[50px] rounded-full object-cover" />
      <p className="ml-[8px] whitespace-nowrap text-[30px] font-semibold leading-none">Modpack Management Panel</p>
      <div className="ml-[72px] flex items-center gap-[6px]">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => {
              const active = item.to === '/' ? isDashboard(pathname) : isActive;
              return `flex h-[40px] items-center gap-[10px] whitespace-nowrap rounded-[8px] pl-[13px] pr-[14px] text-[20px] font-semibold leading-none transition ${
                active ? 'bg-mm-accent text-white [&_img]:brightness-0 [&_img]:invert' : 'text-mm-muted hover:text-white'
              }`;
            }}
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!user) return null;

  return (
    <div ref={ref} className="absolute right-[41px] top-[42px] z-[100]">
      <button type="button" className="flex items-center gap-[11px]" onClick={() => setOpen((v) => !v)}>
        <span className="flex size-[40px] items-center justify-center rounded-full border-2 border-white/30 bg-black/60 text-[18px] font-bold">
          {user.username.charAt(0).toUpperCase()}
        </span>
        <span className="text-[20px] font-semibold leading-none">{user.username}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[52px] w-[240px] overflow-hidden rounded-[15px] border-2 border-mm-frame bg-mm-surface shadow-[0_0_30px_rgba(0,0,0,0.6)]">
          <div className="border-b border-mm-line px-[16px] py-[12px]">
            <p className="truncate text-[18px] font-semibold">{user.username}</p>
            <p className="mt-[2px] text-[15px] capitalize text-mm-muted">{user.role}</p>
          </div>
          <button
            type="button"
            className="w-full px-[16px] py-[12px] text-left text-[18px] hover:bg-mm-chip"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          >
            Settings
          </button>
          <button
            type="button"
            className="w-full px-[16px] py-[12px] text-left text-[18px] text-[#ff8a8a] hover:bg-mm-chip"
            onClick={async () => {
              setOpen(false);
              await signOut();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function PanelAddress() {
  const address = usePanelAddress();
  const navigate = useNavigate();
  const [shown, setShown] = useState(false);

  const copy = async () => {
    if (!address) {
      navigate('/settings');
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      notify('Panel address copied', 'success');
    } catch {
      setShown(true);
    }
  };

  return (
    <div className="absolute left-1/2 top-[991px] flex -translate-x-1/2 flex-col items-center">
      <p className="text-[20px] font-medium leading-[1.15]">MM Panel Address</p>
      <div className="mt-[6px] flex h-[37px] w-[369px] items-center rounded-[2px] border border-mm-line">
        <button
          type="button"
          className="ml-[8px] flex h-full w-[28px] items-center justify-center"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Hide address' : 'Show address'}
          title={shown ? 'Hide address' : 'Show address'}
        >
          <img src="/ui/eye.svg" alt="" width={27} height={21} />
        </button>
        <button
          type="button"
          className="ml-[9px] min-w-0 flex-1 truncate pr-[10px] text-left text-[20px] font-medium leading-[1.15]"
          onClick={copy}
          title={address ? 'Click to copy. Players enter this in the launcher.' : 'Set the public URL in Settings'}
        >
          {!address ? (
            <span className="text-mm-muted">Not set (open Settings)</span>
          ) : shown ? (
            address
          ) : (
            '*'.repeat(Math.min(23, Math.max(12, address.length)))
          )}
        </button>
      </div>
    </div>
  );
}

/**
 * Every signed-in screen: nav bar, user menu, a 368px sidebar column, the 1431×805 main panel and
 * the panel address at the bottom.
 */
export default function Shell({
  sidebar,
  children,
  mainClassName = '',
  background,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  mainClassName?: string;
  /** Image drawn faintly behind the main panel, e.g. the pack background while editing it. */
  background?: string | null;
}) {
  return (
    <>
      <NavBar />
      <UserMenu />
      <aside className="absolute left-[41px] top-[123px] flex h-[805px] w-[368px] flex-col gap-[14px] overflow-y-auto overflow-x-hidden pb-[2px] [scrollbar-width:none]">
        {sidebar}
      </aside>
      <main className={`absolute left-[448px] top-[123px] h-[805px] w-[1431px] overflow-hidden rounded-[25px] bg-mm-surface ${mainClassName}`}>
        {background && (
          <img src={background} alt="" className="pointer-events-none absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative size-full">{children}</div>
      </main>
      <PanelAddress />
    </>
  );
}
