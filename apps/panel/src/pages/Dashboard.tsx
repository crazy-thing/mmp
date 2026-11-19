import type { AdminRelease, Media } from '@mmp/schema';
import { useCallback, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { api } from '../api';
import LauncherPreview from '../components/LauncherPreview';
import PackSidebar from '../components/PackSidebar';
import Shell from '../components/Shell';
import { Empty } from '../components/ui';
import { usePolling, useRefreshOnFocus } from '../hooks';
import { usePacks } from '../packs';

/** Pack list on the left, the selected pack as the launcher shows it on the right. */
export default function Dashboard() {
  const { id } = useParams();
  const { packs, loaded } = usePacks();
  const pack = packs.find((p) => p.id === id) ?? null;
  const [releases, setReleases] = useState<AdminRelease[]>([]);
  const [screenshots, setScreenshots] = useState<Media[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [list, own, shared] = await Promise.all([
      api.listReleases(id),
      api.listScreenshots(id),
      api.listScreenshots(),
    ]).catch(() => [[], [], []] as [AdminRelease[], Media[], Media[]]);
    setReleases(list);
    // The launcher falls back to the server-wide screenshots when a pack has none.
    setScreenshots(own.length > 0 ? own : shared);
  }, [id]);

  useEffect(() => {
    setReleases([]);
    setScreenshots([]);
    void load();
  }, [load]);
  useRefreshOnFocus(load);
  usePolling(releases.some((r) => r.status === 'importing'), 2000, load);

  if (!id && loaded && packs.length > 0) return <Navigate to={`/packs/${packs[0]!.id}`} replace />;
  if (id && loaded && !pack) return <Navigate to="/" replace />;

  return (
    <Shell sidebar={<PackSidebar activeId={id ?? null} />}>
      {pack ? (
        <LauncherPreview key={pack.id} pack={pack} releases={releases} screenshots={screenshots} />
      ) : (
        <Empty>{loaded ? 'Wow, such empty!' : ''}</Empty>
      )}
    </Shell>
  );
}
