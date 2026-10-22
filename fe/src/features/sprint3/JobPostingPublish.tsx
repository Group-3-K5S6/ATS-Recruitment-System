import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CalendarDays, Check, CheckCircle2, Clock3, ExternalLink, Eye, FileText, Globe2, MapPin, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import JobPublicContent, { type PublishedPresentation } from './JobPublicContent';
import { atsApi } from './api';
import { notifyPublicJobsChanged } from './publicJobsSync';
import './job-posting-publish.css';

type JobStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'CLOSED';
type Job = {
  id: string;
  title: string;
  status: JobStatus | string;
  description: string;
  location: string;
  workMode?: string | null;
  applicationDeadline?: string | null;
  showSalary?: boolean;
  approvedAt?: string | null;
  approvedBy?: { fullName: string } | null;
  publishedAt?: string | null;
  publishedBy?: { fullName: string } | null;
  department?: { name?: string } | null;
  recruiter?: { fullName?: string } | null;
};
type Action = 'approve' | 'reject' | 'publish' | 'unpublish';
type Preview = PublishedPresentation & { job: Job & PublishedPresentation['job'] };

const statusText: Record<string, string> = {
  DRAFT: 'Bản nháp', PENDING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt · chờ xuất bản', REJECTED: 'Đã từ chối',
  PUBLISHED: 'Đã xuất bản', CLOSED: 'Đã gỡ',
};
const actionLabel: Record<Action, string> = {
  approve: 'Duyệt tin', reject: 'Từ chối tin', publish: 'Xác nhận xuất bản', unpublish: 'Gỡ tin',
};
function formatDateTime(v?: string | null) {
  if (!v) return 'Chưa ghi nhận';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? 'Chưa ghi nhận' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}
function workModeLabel(v?: string | null) {
  return v === 'REMOTE' ? 'Từ xa' : v === 'HYBRID' ? 'Kết hợp' : v === 'ONSITE' ? 'Tại văn phòng' : 'Đang cập nhật';
}
function publiclyAvailable(job: Job) {
  return job.status === 'PUBLISHED' && !!job.approvedAt && !!job.publishedAt
    && (!job.applicationDeadline || new Date(job.applicationDeadline).getTime() >= Date.now());
}
function actionDescription(action: Action) {
  if (action === 'approve') return 'Tin được đánh dấu Đã duyệt, nhưng chưa xuất hiện công khai cho tới khi được xuất bản.';
  if (action === 'reject') return 'Tin sẽ chuyển sang Đã từ chối và có thể được chỉnh sửa, gửi duyệt lại.';
  if (action === 'unpublish') return 'Tin sẽ được gỡ khỏi cổng tuyển dụng công khai. Bạn có chắc chắn muốn tiếp tục?';
  return 'Sau khi xác nhận, tin sẽ xuất hiện ngay trên cổng tuyển dụng công khai. Hãy đảm bảo đã kiểm tra nội dung trước đó.';
}

export default function JobPostingPublish() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [intent, setIntent] = useState<{ job: Job; action: Action } | null>(null);
  const [notes, setNotes] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'pending' | 'published'>('pending');

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError('');
      setJobs(await atsApi<Job[]>('/api/jobs'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách tin tuyển dụng.');
    } finally { setLoading(false); }
  };
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadJobs(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // HR Manager KHÔNG gửi duyệt bản nháp; chỉ xử lý tin Recruiter đã nộp.
  const pending = useMemo(() => jobs.filter(job => ['PENDING_APPROVAL', 'APPROVED'].includes(job.status)), [jobs]);
  const published = useMemo(() => jobs.filter(job => job.status === 'PUBLISHED'), [jobs]);
  const shown = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    const source = view === 'pending' ? pending : published;
    return source.filter(job => !term || [job.title, job.id, job.department?.name, job.location].some(value => (value || '').toLocaleLowerCase('vi').includes(term)));
  }, [pending, published, view, search]);

  const showPreview = async (job: Job) => {
    try {
      setPreviewLoading(true);
      setError('');
      setPreview(await atsApi<Preview>(`/api/jobs/${encodeURIComponent(job.id)}/preview`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được bản xem trước.');
    } finally { setPreviewLoading(false); }
  };
  const requestAction = (job: Job, action: Action) => {
    setNotes('');
    setDialogError('');
    setIntent({ job, action });
  };
  const confirmAction = async () => {
    if (!intent || requestInFlight.current) return;
    const { job, action } = intent;
    if (action === 'reject' && notes.trim().length < 3) return setDialogError('Vui lòng nhập lý do từ chối từ 3 ký tự trở lên.');
    const valid: Record<Action, string[]> = {
      approve: ['PENDING_APPROVAL'],
      reject: ['PENDING_APPROVAL'], publish: ['APPROVED'], unpublish: ['PUBLISHED'],
    };
    if (!valid[action].includes(job.status)) return setDialogError('Trạng thái tin đã thay đổi. Vui lòng tải lại danh sách.');
    const body = action === 'reject' ? { reason: notes.trim() } : action === 'approve' ? { notes: notes.trim() } : undefined;
    try {
      requestInFlight.current = true;
      setBusyId(job.id);
      setDialogError('');
      setError('');
      setNotice('');
      const updated = await atsApi<Job>(`/api/jobs/${encodeURIComponent(job.id)}/${action}`, 'POST', body);
      const expected: Record<Action, string> = {
        approve: 'APPROVED', reject: 'REJECTED', publish: 'PUBLISHED', unpublish: 'CLOSED',
      };
      if (updated.status !== expected[action]) throw new Error('Backend trả về trạng thái không đúng sau thao tác.');
      setIntent(null);
      setPreview(null);
      if (action === 'publish') setView('published');
      if (action === 'unpublish') {
        setJobs(current => current.map(currentJob => currentJob.id === updated.id ? updated : currentJob));
        notifyPublicJobsChanged();
      }
      const text = action === 'publish' ? 'Đã xuất bản công khai' : action === 'unpublish' ? 'Đã gỡ' : action === 'approve' ? 'Đã duyệt' : 'Đã từ chối';
      setNotice(`${text} tin “${job.title}”.`);
      await loadJobs(); // Re-fetch audit names/timestamps, not just a partial mutation response.
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : 'Không thể hoàn thành thao tác.');
    } finally {
      requestInFlight.current = false;
      setBusyId(null);
    }
  };

  const renderActions = (job: Job) => <div className="s310-card-actions">
    {job.status === 'PUBLISHED' ? publiclyAvailable(job)
      ? <a className="s310-btn s310-btn-primary" href={`/careers/${encodeURIComponent(job.id)}`}><Globe2 size={16}/> Xem trang công khai <ExternalLink size={14}/></a>
      : <span className="s310-muted-inline"><AlertCircle size={15}/> Tin chưa đủ điều kiện hiển thị công khai</span>
      : job.status === 'CLOSED' ? <span className="s310-muted-inline"><AlertCircle size={15}/> Tin đã được gỡ khỏi trang công khai</span>
      : <>
        <button type="button" className="s310-btn s310-btn-secondary" disabled={previewLoading || busyId !== null} onClick={() => void showPreview(job)}><Eye size={16}/> Xem trước</button>
        {job.status === 'PENDING_APPROVAL' && <><button type="button" className="s310-btn s310-btn-primary" disabled={busyId !== null} onClick={() => requestAction(job, 'approve')}><Check size={16}/> Duyệt</button><button type="button" className="s310-btn s310-btn-danger-outline" disabled={busyId !== null} onClick={() => requestAction(job, 'reject')}>Từ chối</button></>}
        {job.status === 'APPROVED' && <button type="button" className="s310-btn s310-btn-primary" disabled={busyId !== null} onClick={() => requestAction(job, 'publish')}><Globe2 size={16}/> Xuất bản</button>}
      </>}
    {job.status === 'PUBLISHED' && <button type="button" className="s310-btn s310-btn-danger-outline" disabled={busyId !== null} onClick={() => requestAction(job, 'unpublish')}><X size={16}/> Gỡ tin</button>}
  </div>;

  return <section className="s310-page s310-reworked">
    <header className="s310-header"><div><span className="s310-admin-eyebrow"><ShieldCheck size={14}/> QUẢN LÝ TIN TUYỂN DỤNG</span><h1>Duyệt & xuất bản</h1><p>Trưởng phòng Nhân sự duyệt hoặc từ chối tin đã được Recruiter gửi. Tin được duyệt mới có thể xuất bản.</p></div><a className="s310-admin-publiclink" href="/careers"><Globe2 size={18}/> Mở cổng công khai <ExternalLink size={15}/></a></header>
    <div className="s310-flow"><div><span>01</span><strong>Gửi duyệt</strong><small>Recruiter tạo tin nháp</small></div><ArrowRight size={17}/><div><span>02</span><strong>Phê duyệt</strong><small>HR Manager kiểm tra</small></div><ArrowRight size={17}/><div><span>03</span><strong>Xuất bản</strong><small>Hiển thị trên cổng công khai</small></div></div>
    {error && <div className="s310-alert s310-alert-error" role="alert"><AlertCircle size={18}/>{error}</div>}
    {notice && <div className="s310-alert s310-alert-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
    <div className="s310-workspace">
      <div className="s310-workspace-top"><div className="s310-tabs" role="tablist" aria-label="Trạng thái tin tuyển dụng"><button role="tab" type="button" aria-selected={view === 'pending'} className={view === 'pending' ? 'active' : ''} onClick={() => { setView('pending'); setSearch(''); }}>Chờ duyệt / xuất bản <span>{pending.length}</span></button><button role="tab" type="button" aria-selected={view === 'published'} className={view === 'published' ? 'active' : ''} onClick={() => { setView('published'); setSearch(''); }}>Đã xuất bản <span>{published.length}</span></button></div><button type="button" className="s310-refresh" onClick={() => void loadJobs()} disabled={loading} title="Tải lại danh sách"><RefreshCw size={16}/> Làm mới</button></div>
      <p className="s310-workspace-hint">{view === 'pending' ? 'Chỉ nhận tin Recruiter đã gửi; soạn bản nháp và gửi duyệt thuộc tài khoản Recruiter.' : 'Thông tin phê duyệt và xuất bản chỉ dành cho nhân sự nội bộ.'}</p>
      <div className="s310-workspace-toolbar"><label className="s310-search"><Search size={18}/><input aria-label="Tìm tin tuyển dụng" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên tin, phòng ban, địa điểm hoặc mã…" /></label><span>{shown.length} tin {view === 'pending' ? 'cần xử lý' : 'đã xuất bản'}</span></div>
      <div className="s310-cards" role="tabpanel">
        {loading ? <div className="s310-empty">Đang tải danh sách tin…</div> : shown.length === 0 ? <div className="s310-empty"><FileText size={28}/><strong>{search ? 'Không tìm thấy tin phù hợp' : view === 'pending' ? 'Chưa có tin nào chờ HR phê duyệt hoặc xuất bản' : 'Chưa có tin nào được xuất bản'}</strong><span>{search ? 'Thử từ khóa khác hoặc xóa ô tìm kiếm.' : 'Các tin theo trạng thái này sẽ được hiển thị tại đây.'}</span>{search && <button type="button" className="s310-btn s310-btn-secondary" onClick={() => setSearch('')}>Xóa tìm kiếm</button>}</div> : shown.map(job => <article className="s310-work-card" key={job.id}>
          <div className="s310-work-card-main"><div className="s310-work-card-title"><span className="s310-card-icon"><FileText size={22}/></span><div><strong>{job.title}</strong><small>Mã tin: {job.id}</small></div></div><span className={`s310-stage s310-stage-${job.status.toLowerCase()}`}>{statusText[job.status] || job.status}</span></div>
          <div className="s310-work-card-meta"><span><Users size={15}/>{job.department?.name || 'Chưa xác định phòng ban'}</span><span><MapPin size={15}/>{job.location || 'Chưa rõ địa điểm'}</span><span><Clock3 size={15}/>{workModeLabel(job.workMode)}</span><span className="s310-recruiter-tag">Recruiter: {job.recruiter?.fullName || 'Chưa phân công'}</span></div>
          {job.status === 'PUBLISHED' && <div className="s310-public-audit"><div><small>NGƯỜI DUYỆT</small><strong>{job.approvedBy?.fullName || 'Chưa ghi nhận'}</strong><span><CalendarDays size={13}/>{formatDateTime(job.approvedAt)}</span></div><div><small>NGƯỜI XUẤT BẢN</small><strong>{job.publishedBy?.fullName || 'Chưa ghi nhận'}</strong><span><CalendarDays size={13}/>{formatDateTime(job.publishedAt)}</span></div></div>}
          {job.status === 'PUBLISHED' && (!publiclyAvailable(job) || !job.applicationDeadline) && <div className="s310-card-warning"><AlertCircle size={15}/>{!publiclyAvailable(job) ? 'Tin cũ thiếu dữ liệu duyệt/xuất bản hoặc đã hết hạn; có thể không hiển thị ngoài cổng.' : 'Hạn nhận hồ sơ chưa được thiết lập. Nên bổ sung trước khi sử dụng thực tế.'}</div>}
          <div className="s310-work-card-footer"><span className="s310-card-action-hint">{job.status === 'PENDING_APPROVAL' ? 'Đang chờ quyết định của HR Manager' : job.status === 'APPROVED' ? 'Tin đã duyệt, cần xác nhận trước khi công khai' : job.status === 'PUBLISHED' ? 'Tin đã chuyển sang khu vực công khai (nếu còn hiệu lực)' : 'Tin này chưa được công khai'}</span>{renderActions(job)}</div>
        </article>)}
      </div>
    </div>

    {preview && <div className="s310-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setPreview(null); }}><div className="s310-modal" role="dialog" aria-modal="true" aria-labelledby="s310-preview-title"><div className="s310-modal-toolbar"><div><strong id="s310-preview-title">Xem trước tin tuyển dụng</strong><span>Nội dung giống trang chi tiết công khai; chưa tự động xuất bản.</span></div><button type="button" className="s310-close" onClick={() => setPreview(null)} aria-label="Đóng xem trước"><X size={20}/></button></div><JobPublicContent data={preview}/><div className="s310-preview-bottom"><span><ShieldCheck size={15}/> Đây chỉ là bản xem trước dành cho nhân sự.</span><button type="button" className="s310-btn s310-btn-secondary" onClick={() => setPreview(null)}>Đóng xem trước</button></div></div></div>}
    {intent && <div className="s310-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busyId) setIntent(null); }}><form className="s310-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="s310-confirm-title" onSubmit={e => { e.preventDefault(); void confirmAction(); }}><header><span className={`s310-confirm-icon ${intent.action === 'reject' || intent.action === 'unpublish' ? 'warn' : ''}`}>{intent.action === 'reject' || intent.action === 'unpublish' ? <AlertCircle size={24}/> : intent.action === 'publish' ? <Globe2 size={24}/> : <ShieldCheck size={24}/>}</span><button type="button" aria-label="Đóng" className="s310-close" disabled={busyId !== null} onClick={() => setIntent(null)}><X size={19}/></button></header><h2 id="s310-confirm-title">{actionLabel[intent.action]}</h2><strong className="s310-confirm-job">{intent.job.title}</strong><p>{actionDescription(intent.action)}</p>
      {intent.action === 'publish' && !intent.job.applicationDeadline && <div className="s310-card-warning"><AlertCircle size={16}/> Tin chưa có hạn nhận hồ sơ; hãy xem lại nội dung trước khi công khai.</div>}
      {(intent.action === 'approve' || intent.action === 'reject') && <label className="s310-dialog-field">{intent.action === 'reject' ? 'Lý do từ chối (bắt buộc)' : 'Ý kiến duyệt (không bắt buộc)'}<textarea value={notes} onChange={e => { setNotes(e.target.value); setDialogError(''); }} rows={3} placeholder={intent.action === 'reject' ? 'Nhập lý do cụ thể để recruiter chỉnh sửa…' : 'Nhập ghi chú nếu cần…'}/></label>}
      {dialogError && <div className="s310-alert s310-alert-error" role="alert"><AlertCircle size={15}/>{dialogError}</div>}
      <footer><button type="button" className="s310-btn s310-btn-secondary" disabled={busyId !== null} onClick={() => setIntent(null)}>Quay lại</button><button type="submit" className={`s310-btn ${intent.action === 'reject' || intent.action === 'unpublish' ? 's310-btn-danger' : 's310-btn-primary'}`} disabled={busyId !== null}>{busyId ? 'Đang xử lý…' : actionLabel[intent.action]}</button></footer></form></div>}
  </section>;
}
