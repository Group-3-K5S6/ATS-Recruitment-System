import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, FileText, RefreshCw, UserRound } from 'lucide-react';
import {
  CandidateApiError,
  getCandidate,
  getCandidateCv,
  getCandidateCvApiOrigin,
} from '../services/candidateApi';
import type { CandidateApplication, CandidateRecord } from '../services/candidateApi';
import './CandidateProfilePage.css';

type SessionUser = {
  id: string;
  roles: string[];
};

type CvState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; url: string; previewable: boolean }
  | { kind: 'unavailable'; message: string };

function getSessionUser(): SessionUser | null {
  try {
    const value = sessionStorage.getItem('atsUser');
    const user = value ? JSON.parse(value) as Partial<SessionUser> : null;
    return user?.id && Array.isArray(user.roles)
      ? { id: user.id, roles: user.roles }
      : null;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof CandidateApiError)) return 'Không thể tải hồ sơ ứng viên. Vui lòng thử lại.';
  switch (error.kind) {
    case 'forbidden': return 'Bạn không có quyền xem hồ sơ ứng viên này.';
    case 'notFound': return 'Không tìm thấy hồ sơ ứng viên.';
    case 'unauthorized': return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
    case 'network': return 'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối và thử lại.';
    default: return 'Máy chủ chưa thể tải hồ sơ lúc này. Vui lòng thử lại.';
  }
}

function safeCvUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const sameApiOrigin = url.origin === getCandidateCvApiOrigin();
    if (url.protocol !== 'https:' && !sameApiOrigin) return null;
    return url;
  } catch {
    return null;
  }
}

function isPdfUrl(url: URL): boolean {
  return url.pathname.toLocaleLowerCase('en-US').endsWith('.pdf');
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa có thông tin'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(date);
}

function stageLabel(value: string): string {
  const known: Record<string, string> = {
    APPLIED: 'Đã nộp',
    SCREENING: 'Sàng lọc',
    INTERVIEW: 'Phỏng vấn',
    OFFER: 'Đề nghị tuyển dụng',
    HIRED: 'Đã tuyển',
    REJECTED: 'Không tiếp tục',
  };
  return known[value] || value;
}

function ApplicationHistory({ applications }: { applications: CandidateApplication[] }) {
  if (applications.length === 0) {
    return <p className="candidate-profile-empty">Chưa có lịch sử ứng tuyển trong phạm vi được phép xem.</p>;
  }

  return (
    <div className="candidate-profile-applications">
      {applications.map(application => (
        <article className="candidate-profile-application" key={application.id}>
          <div className="candidate-profile-application-icon" aria-hidden="true"><BriefcaseBusiness size={19}/></div>
          <div className="candidate-profile-application-main">
            <h3>{application.job?.title || 'Vị trí không có tên'}</h3>
            <p>Mã hồ sơ: {application.id}</p>
            <p>Ngày ứng tuyển: {formatDate(application.createdAt)}</p>
          </div>
          <div className="candidate-profile-application-status">
            <span>{stageLabel(application.stage)}</span>
            <small>{application.status}</small>
          </div>
        </article>
      ))}
    </div>
  );
}

function CandidateCv({ candidateId, hasCv }: { candidateId: string; hasCv: boolean }) {
  const [state, setState] = useState<CvState>(hasCv ? { kind: 'loading' } : { kind: 'none' });
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasCv) return;

    const abort = new AbortController();
    getCandidateCv(candidateId, abort.signal)
      .then(result => {
        const url = safeCvUrl(result.cvUrl);
        if (!url) {
          setState({ kind: 'unavailable', message: 'Đường dẫn CV không an toàn hoặc không hợp lệ.' });
          return;
        }
        setState({ kind: 'ready', url: url.href, previewable: isPdfUrl(url) });
      })
      .catch(error => {
        if (abort.signal.aborted) return;
        if (error instanceof CandidateApiError && error.kind === 'unauthorized') {
          navigate('/login', { replace: true });
          return;
        }
        if (error instanceof CandidateApiError && error.kind === 'notFound') {
          setState({ kind: 'none' });
          return;
        }
        setState({ kind: 'unavailable', message: errorMessage(error) });
      });
    return () => abort.abort();
  }, [candidateId, hasCv, navigate]);

  if (state.kind === 'loading') return <p className="candidate-profile-empty" role="status">Đang tải CV…</p>;
  if (state.kind === 'none') return <p className="candidate-profile-empty">Ứng viên chưa có CV.</p>;
  if (state.kind === 'unavailable') return <p className="candidate-profile-empty" role="status">{state.message}</p>;
  if (!state.previewable) {
    return <a className="candidate-profile-open-cv" href={state.url} target="_blank" rel="noreferrer noopener">Mở CV trong tab mới</a>;
  }

  return (
    <iframe
      className="candidate-profile-pdf"
      src={state.url}
      title="CV ứng viên"
      referrerPolicy="no-referrer"
    />
  );
}

function CandidateProfileContent({ id }: { id: string }) {
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const sessionUser = useMemo(() => getSessionUser(), []);

  useEffect(() => {
    const abort = new AbortController();
    getCandidate(id, abort.signal)
      .then(record => {
        setCandidate({
          ...record,
          applications: Array.isArray(record.applications) ? record.applications : [],
        });
      })
      .catch(requestError => {
        if (abort.signal.aborted) return;
        if (requestError instanceof CandidateApiError && requestError.kind === 'unauthorized') {
          navigate('/login', { replace: true });
          return;
        }
        setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [id, navigate, retry]);

  const applications = useMemo(() => {
    const records = candidate?.applications || [];
    if (
      !sessionUser?.roles.includes('HIRING_MANAGER')
      || sessionUser.roles.includes('RECRUITER')
    ) return records;
    return records.filter(application => application.job?.hiringManagerId === sessionUser.id);
  }, [candidate, sessionUser]);

  return (
    <main className="candidate-profile-page">
      <div className="candidate-profile-container">
        <Link className="candidate-profile-back" to="/"><ArrowLeft size={16}/> Về trang quản lý</Link>
        {loading ? (
          <div className="candidate-profile-feedback" role="status">Đang tải hồ sơ ứng viên…</div>
        ) : error ? (
          <section className="candidate-profile-feedback candidate-profile-error" role="alert">
            <h1>Không thể mở hồ sơ</h1>
            <p>{error}</p>
            {error.includes('đăng nhập lại') ? (
              <button type="button" onClick={() => navigate('/login', { replace: true })}>Đăng nhập</button>
            ) : (
              <button type="button" onClick={() => {
                setError('');
                setLoading(true);
                setRetry(value => value + 1);
              }}><RefreshCw size={16}/> Thử lại</button>
            )}
          </section>
        ) : candidate ? (
          <>
            <header className="candidate-profile-heading">
              <span className="candidate-profile-avatar" aria-hidden="true"><UserRound size={25}/></span>
              <div>
                <span className="candidate-profile-eyebrow">HỒ SƠ ỨNG VIÊN</span>
                <h1>{candidate.fullName}</h1>
              </div>
            </header>

            <div className="candidate-profile-grid">
              <section className="candidate-profile-panel candidate-profile-personal" aria-labelledby="candidate-personal-title">
                <h2 id="candidate-personal-title">Thông tin cá nhân</h2>
                <dl>
                  <div><dt>Email</dt><dd>{candidate.email}</dd></div>
                  {candidate.phone && <div><dt>Số điện thoại</dt><dd>{candidate.phone}</dd></div>}
                  {candidate.currentCompany && <div><dt>Nơi làm việc hiện tại</dt><dd>{candidate.currentCompany}</dd></div>}
                  {candidate.address && <div><dt>Địa chỉ</dt><dd>{candidate.address}</dd></div>}
                </dl>
              </section>

              <section className="candidate-profile-panel candidate-profile-cv" aria-labelledby="candidate-cv-title">
                <h2 id="candidate-cv-title"><FileText size={19}/> CV</h2>
                <CandidateCv candidateId={candidate.id} hasCv={!!candidate.cvUrl}/>
              </section>

              <section className="candidate-profile-panel candidate-profile-history" aria-labelledby="candidate-history-title">
                <h2 id="candidate-history-title">Lịch sử ứng tuyển <span>{applications.length}</span></h2>
                <ApplicationHistory applications={applications}/>
              </section>

              <section className="candidate-profile-panel candidate-profile-notes" aria-labelledby="candidate-notes-title">
                <h2 id="candidate-notes-title">Nhãn và ghi chú</h2>
                <p className="candidate-profile-empty">Backend hiện chưa cung cấp dữ liệu nhãn hoặc ghi chú ứng viên.</p>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}

export default function CandidateProfilePage() {
  const { id = '' } = useParams<{ id: string }>();
  return <CandidateProfileContent key={id} id={id}/>;
}
