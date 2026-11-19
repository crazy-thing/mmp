import { useEffect, useRef } from 'react';

/** Re-runs `refresh` when the tab regains focus, like the v4 panel did. */
export function useRefreshOnFocus(refresh: () => unknown): void {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) latest.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}

/** Calls `tick` every `ms` while `active` is true. */
export function usePolling(active: boolean, ms: number, tick: () => unknown): void {
  const latest = useRef(tick);
  latest.current = tick;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => latest.current(), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
