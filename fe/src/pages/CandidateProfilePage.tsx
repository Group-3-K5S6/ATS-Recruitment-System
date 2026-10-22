import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BriefcaseBusiness, FileText, RefreshCw, UserRound } from 'lucide-react';
import {
  CandidateApiError,
  getCandidate,
  getCandidateCv,
  getCandidateCvPdf,
  getCandidateCvApiOrigin,
} from '../services/candidateApi';
import type { CandidateApplication, CandidateRecord } from '../services/candidateApi';
import './CandidateProfilePage.css';

type CvState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'ready'; url: string; previewable: boolean }
  | { kind: 'unavailable'; message: string };

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
    WITHDRAWN: 'Ứng viên rút',
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
          {(application.interviews?.length ?? 0) > 0 && (
            <div className="candidate-profile-history-details">
              <strong>Lịch phỏng vấn</strong>
              {application.interviews?.map(interview => (
                <div key={interview.id}>
                  {formatDate(interview.scheduledAt)} · {interview.status}
                  {interview.interviewer?.fullName ? ` · ${interview.interviewer.fullName}` : ''}
                  {interview.evaluations?.map(evaluation => (
                    <p key={evaluation.id}>
                      Đánh giá: {evaluation.score} điểm
                      {evaluation.recommendation ? ` · ${evaluation.recommendation}` : ''}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
          {(application.offers?.length ?? 0) > 0 && (
            <div className="candidate-profile-history-details">
              <strong>Đề nghị tuyển dụng</strong>
              {application.offers?.map(offer => (
                <p key={offer.id}>Trạng thái: {offer.status}</p>
              ))}
            </div>
          )}
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
    let objectUrl: string | null = null;
    const load = async () => {
      try {
        const result = await getCandidateCv(candidateId, abort.signal);
        if (result.cvUrl.startsWith('s409-demo://')) {
          // LOCAL TEST only: never expose bearer token or an unauthenticated PDF link.
          const blob = await getCandidateCvPdf(candidateId, abort.signal);
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setState({ kind: 'ready', url: objectUrl, previewable: true });
          return;
        }
        const url = safeCvUrl(result.cvUrl);
        if (!url) {
          setState({ kind: 'unavailable', message: 'Đường dẫn CV không an toàn hoặc không hợp lệ.' });
          return;
        }
        setState({ kind: 'ready', url: url.href, previewable: isPdfUrl(url) });
      } catch (error) {
        if (abort.signal.aborted) return;
        if (error instanceof CandidateApiError && error.kind === 'unauthorized') {
          navigate('/login', { replace: true });
          return;
        }
        if (error instanceof CandidateApiError && error.kind === 'notFound') {
          setState({ kind: 'unavailable', message: 'CV chưa được lưu trên máy chủ kiểm thử.' });
          return;
        }
        setState({ kind: 'unavailable', message: errorMessage(error) });
      }
    };
    void load();
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidateId, hasCv, navigate]);
  if (state.kind === 'loading') return <p className="candidate-profile-empty" role="status">Đang tải CV…</p>;
  if (state.kind === 'none') return <p className="candidate-profile-empty">Ứng viên chưa có CV.</p>;
  if (state.kind === 'unavailable') return <p className="candidate-profile-empty" role="status">{state.message}</p>;
  if (!state.previewable) {
    return <a className="candidate-profile-open-cv" href={state.url} target="_blank" rel="noreferrer noopener">Mở CV trong tab mới</a>;
  }
  return <iframe className="candidate-profile-pdf" src={state.url} title="CV ứng viên" referrerPolicy="no-referrer" />;
}

function CandidateProfileContent({ id }: { id: string }) {
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState<CandidateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

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

  // Scoping of application history is enforced server-side by CandidateService.
  const applications = candidate?.applications ?? [];

  return (
    <main className="candidate-profile-page">
      <div className="candidate-profile-container">
        <Link className="candidate-profile-back" to="/candidate-profiles"><ArrowLeft size={16}/> Danh sách hồ sơ ứng viên</Link>
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
                <div className="candidate-profile-tags">
                  {candidate.labels?.trim()
                    ? candidate.labels.split(',').map(label => label.trim()).filter(Boolean).map((label, index) => (
                        <span key={`${label}-${index}`}>{label}</span>
                      ))
                    : <p className="candidate-profile-empty">Chưa có nhãn.</p>}
                </div>
                <p className="candidate-profile-note-value">{candidate.notes?.trim() || 'Chưa có ghi chú.'}</p>
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
