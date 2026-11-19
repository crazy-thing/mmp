import type { HealthLevel, ServerHealth, UpdateStatus } from '@mmp/schema';
import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api';

const DOT: Record<HealthLevel, string> = {
  ok: 'bg-mm-released',
  warn: 'bg-mm-dev',
  error: 'bg-mm-danger',
  off: 'bg-[#555]',
};

/** Health checks and the update notice, at the top of Settings. */
export default function ServerStatus() {
  const [health, setHealth] = useState<ServerHealth | null>(null);
  const [update, setUpdate] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (refresh: boolean) => {
    setChecking(true);
    setError(null);
    try {
      const [h, u] = await Promise.all([api.health(), api.updateStatus(refresh)]);
      setHealth(h);
      setUpdate(u);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check(false);
  }, [check]);

  return (
    <div className="flex flex-col gap-[16px]">
      {update?.updateAvailable && (
        <div className="rounded-[10px] border border-mm-accent bg-mm-accent/15 px-[16px] py-[12px] text-[17px] leading-[1.4]">
          <span className="font-semibold">Version {update.latest} is available</span> (you have {update.current}).{' '}
          {update.releaseUrl && (
            <a href={update.releaseUrl} target="_blank" rel="noreferrer" className="underline hover:text-mm-accent">
              What's new
            </a>
          )}
          <p className="mt-[4px] text-[15px] text-[#ccc]">
            With Docker Compose, update by running <code className="text-white">docker compose pull && docker compose up -d</code> in
            the server folder. Your packs and settings are kept.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-[16px] text-mm-muted">
        <span>
          Server version <span className="text-white">{health?.version ?? update?.current ?? '…'}</span>
          {update && !update.updateAvailable && (
            <span> · {update.error ?? (update.latest ? 'Up to date' : '')}</span>
          )}
        </span>
        <button
          type="button"
          onClick={() => void check(true)}
          disabled={checking}
          className="flex items-center gap-[6px] text-[16px] hover:text-white disabled:opacity-50"
        >
          <RefreshCw size={16} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : 'Check again'}
        </button>
      </div>

      {error && <p className="text-[16px] text-[#ff8a8a]">{error}</p>}

      <ul className="grid grid-cols-2 gap-x-[28px] gap-y-[14px]">
        {(health?.checks ?? []).map((c) => (
          <li key={c.id} className="flex items-start gap-[10px]">
            <span className={`mt-[6px] size-[11px] shrink-0 rounded-full ${DOT[c.level]}`} aria-label={c.level} />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold leading-tight">{c.label}</p>
              <p className="text-[15px] leading-[1.35] text-[#bbb]">{c.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
