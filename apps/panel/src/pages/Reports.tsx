import type { ReportDetail, ReportSummary } from '@mmp/schema';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { api, errorMessage } from '../api';
import Shell from '../components/Shell';
import { notify } from '../components/Toast';
import { Empty } from '../components/ui';

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

function KindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={`inline-flex h-[20px] items-center rounded-[5px] px-[8px] text-[14px] font-bold leading-none ${kind === 'crash' ? 'bg-[#aa3d3d]' : 'bg-[#1e4a7a]'}`}
    >
      {kind === 'crash' ? 'Crash' : 'Bug'}
    </span>
  );
}

/** Crash logs and bug reports sent from the launcher. */
export default function Reports() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<ReportDetail | null>(null);

  useEffect(() => {
    api
      .listReports()
      .then(setReports)
      .catch((err) => notify(errorMessage(err)))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    setDetail(null);
    if (!id) return;
    api
      .getReport(id)
      .then(setDetail)
      .catch((err) => notify(errorMessage(err)));
  }, [id]);

  const remove = async (reportId: string) => {
    if (!confirm('Delete this report?')) return;
    try {
      await api.deleteReport(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      navigate('/reports');
    } catch (err) {
      notify(errorMessage(err));
    }
  };

  const sidebar = reports.map((report) => (
    <button
      key={report.id}
      type="button"
      onClick={() => navigate(`/reports/${report.id}`)}
      className={`w-[368px] shrink-0 rounded-[25px] px-[23px] py-[18px] text-left transition-colors ${
        report.id === id ? 'bg-mm-frame' : 'bg-mm-surface hover:bg-[#202027]'
      }`}
    >
      <div className="flex items-center gap-[10px]">
        <KindBadge kind={report.kind} />
        <span className="truncate text-[18px] font-bold">{report.playerName ?? 'Unknown player'}</span>
      </div>
      <p className="mt-[8px] truncate text-[17px]">{report.message || '(no note)'}</p>
      <p className="mt-[4px] truncate text-[14px] text-mm-muted">
        {report.packName ?? 'No pack'}
        {report.releaseName ? ` · ${report.releaseName}` : ''} · {when(report.createdAt)}
      </p>
    </button>
  ));

  return (
    <Shell sidebar={sidebar}>
      {detail ? (
        <div className="flex size-full flex-col p-[28px]">
          <div className="flex items-start gap-[20px]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-[12px]">
                <KindBadge kind={detail.kind} />
                <span className="text-[16px] text-mm-muted">{when(detail.createdAt)}</span>
              </div>
              <p className="mt-[10px] break-words text-[26px] font-bold leading-[1.2]">{detail.message || '(no note)'}</p>
              <p className="mt-[8px] text-[16px] text-mm-muted">
                {detail.playerName ?? 'Unknown player'}
                {detail.playerUuid ? ` · ${detail.playerUuid}` : ''} · launcher {detail.launcherVersion}
                {detail.packName ? ` · ${detail.packName}` : ''}
                {detail.releaseName ? ` · ${detail.releaseName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(detail.id)}
              className="h-[37px] shrink-0 rounded-[10px] border border-[#7a2a2a] px-[18px] text-[18px] font-semibold text-[#ff8a8a] hover:bg-[#5a1f24] hover:text-white"
            >
              Delete
            </button>
          </div>
          <div className="mt-[20px] grid min-h-0 flex-1 grid-cols-2 gap-[16px]">
            <Log title="Launcher session" text={detail.sessionLog} />
            <Log title="Game log" text={detail.gameLog ?? 'No game log was attached.'} />
          </div>
        </div>
      ) : (
        <Empty>
          {!loaded
            ? ''
            : reports.length === 0
              ? 'Wow, such empty! A crash offers to send its log, and Ctrl+B in the launcher reports a bug.'
              : id
                ? 'Loading…'
                : 'Select a report to read its logs.'}
        </Empty>
      )}
    </Shell>
  );
}

function Log({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-[15px] border-2 border-mm-frame bg-mm-bg">
      <div className="flex items-center justify-between border-b border-mm-line px-[16px] py-[10px]">
        <p className="text-[18px] font-semibold">{title}</p>
        <button
          type="button"
          className="text-[15px] text-mm-muted hover:text-white"
          onClick={() => navigator.clipboard.writeText(text).then(() => notify(`${title} copied`, 'success'), () => {})}
        >
          Copy
        </button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-[14px] font-mono text-[13px] leading-[1.45] text-[#ccc]">{text}</pre>
    </div>
  );
}
