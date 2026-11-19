import type { AdminPack } from '@mmp/schema';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, errorMessage } from './api';
import { notify } from './components/Toast';
import { useRefreshOnFocus } from './hooks';

interface PacksState {
  packs: AdminPack[];
  loaded: boolean;
  refresh: () => Promise<void>;
}

const PacksContext = createContext<PacksState | null>(null);

/** The pack list the sidebar shows on every dashboard screen. */
export function PacksProvider({ children }: { children: ReactNode }) {
  const [packs, setPacks] = useState<AdminPack[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setPacks(await api.listPacks());
    } catch (err) {
      notify(`Couldn't load modpacks: ${errorMessage(err)}`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useRefreshOnFocus(refresh);

  return <PacksContext.Provider value={{ packs, loaded, refresh }}>{children}</PacksContext.Provider>;
}

export function usePacks(): PacksState {
  const ctx = useContext(PacksContext);
  if (!ctx) throw new Error('usePacks must be used inside PacksProvider');
  return ctx;
}
