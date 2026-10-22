import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CandidateApiError,
  getCandidateDirectory,
  getHiringManagerJobs,
} from '../services/candidateApi';
import type { CandidateDirectoryEntry, HiringManagerJob } from '../services/candidateApi';
import './CandidateDirectoryPage.css';

type Props = { view: 'jobs' | 'candidates' };

function friendlyError(error: unknown) {
  if (error instanceof CandidateApiError) {
    if (error.kind === 'forbidden') return 'Bạn chưa được phân quyền xem các hồ sơ này.';
    if (error.kind === 'unauthorized') return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  }
  return 'Không tải được dữ liệu. Vui lòng thử lại.';
}

export default function CandidateDirectoryPage({ view }: Props) {
  const [params, setParams] = useSearchParams();
  const selectedJob = params.get('job') || '';
  const [candidates, setCandidates] = useState<CandidateDirectoryEntry[]>([]);
  const [jobs, setJobs] = useState<HiringManagerJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        if (view === 'jobs') {
          const data = await getHiringManagerJobs(controller.signal);
          if (!controller.signal.aborted) setJobs(data);
        } else {
          const data = await getCandidateDirectory(controller.signal);
          if (!controller.signal.aborted) setCandidates(data);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(friendlyError(cause));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [view, reload]);

  const jobOptions = useMemo(() => {
    const positions = new Map<
      string,
      { id: string; title: string; count: number }
    >();

    candidates.forEach(candidate => {
      const seen = new Set<string>();

      candidate.applications.forEach(application => {
        const job = application.job;
        if (!job || seen.has(application.jobId)) return;

        seen.add(application.jobId);

        const existing = positions.get(application.jobId);
        if (existing) {
          existing.count += 1;
        } else {
          positions.set(application.jobId, {
            id: application.jobId,
            title: job.title,
            count: 1,
          });
        }
      });
    });

    return Array.from(positions.values()).sort((a, b) =>
      a.title.localeCompare(b.title, 'vi')
    );
  }, [candidates]);
  const visibleCandidates = useMemo(() => candidates
    .map(candidate => ({
      ...candidate,
      applications: candidate.applications.filter(app => !selectedJob || app.jobId === selectedJob),
    }))
    .filter(candidate => candidate.applications.length > 0), [candidates, selectedJob]);

  const retry = () => {
    setError('');
    setLoading(true);
    setReload(value => value + 1);
  };

  return (
    <div className="s409-directory" data-testid="s409-directory">
      <div className="s409-directory-header">
        <div>
          <p className="s409-directory-eyebrow">QUẢN LÝ TUYỂN DỤNG</p>
          <h1>{view === 'jobs' ? 'Vị trí của tôi' : 'Ứng viên theo vị trí'}</h1>
          <p>{view === 'jobs'
            ? 'Các vị trí tuyển dụng thuộc phạm vi quản lý của bạn.'
            : 'Chọn ứng viên để xem hồ sơ hợp nhất và lịch sử ứng tuyển.'}</p>
        </div>
        <Link to="/dashboard">Về tổng quan</Link>
      </div>

      {!loading && !error && view === 'candidates' && (
        <div className="s409-directory-filter">
          <label htmlFor="s409-job-filter">
            Vị trí tuyển dụng
          </label>

          <select
            id="s409-job-filter"
            value={selectedJob}
            onChange={event => {
              const next = new URLSearchParams(params);

              if (event.target.value) {
                next.set('job', event.target.value);
              } else {
                next.delete('job');
              }

              setParams(next);
            }}
          >
            <option value="">Tất cả vị trí được phân quyền</option>
            {jobOptions.map(job => (
              <option key={job.id} value={job.id}>
                {job.title} ({job.count} ứng viên)
              </option>
            ))}
          </select>

          <span>{visibleCandidates.length} ứng viên</span>
        </div>
      )}

      {loading && <div className="s409-directory-message" role="status">Đang tải dữ liệu…</div>}
      {!loading && error && (
        <div className="s409-directory-message" role="alert">
          {error} <button type="button" onClick={retry}>Thử lại</button>
        </div>
      )}

      {!loading && !error && view === 'jobs' && (
        <div className="s409-directory-list">
          {jobs.length === 0 && <p className="s409-directory-message">Chưa có vị trí tuyển dụng được phân công.</p>}
          {jobs.map(job => (
            <article className="s409-directory-item" key={job.id}>
              <div>
                <h2>{job.title}</h2>
                <p>{job.department?.name ?? 'Chưa có phòng ban'} · Trạng thái: {job.status}</p>
                {typeof job.candidateCount === 'number' && <p>{job.candidateCount} ứng viên</p>}
              </div>
              <Link to={`/candidate-profiles?job=${encodeURIComponent(job.id)}`}>Xem ứng viên</Link>
            </article>
          ))}
        </div>
      )}

      {!loading && !error && view === 'candidates' && (
        <div className="s409-directory-list">
          {visibleCandidates.length === 0 && (
            <p className="s409-directory-message">Không có ứng viên trong phạm vi được phân quyền cho vị trí này.</p>
          )}
          {visibleCandidates.map(candidate => (
            <article className="s409-directory-item" key={candidate.id}>
              <div>
                <h2>{candidate.fullName}</h2>
                <p>Vị trí liên quan: {candidate.applications.map(a => a.job?.title || 'Chưa xác định').join(', ')}</p>
              </div>
              <Link to={`/candidates/${encodeURIComponent(candidate.id)}`}>Xem hồ sơ hợp nhất</Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
