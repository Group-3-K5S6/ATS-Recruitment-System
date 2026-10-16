import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  MapPin,
  Save,
  Send,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { atsApi, fromError } from './api';
import type { Requisition } from './api';
import './job-posting-draft.css';

type WorkMode = 'ONSITE' | 'HYBRID' | 'REMOTE';
type DraftForm = {
  title: string;
  description: string;
  location: string;
  workMode: WorkMode;
  applicationDeadline: string;
  showSalary: boolean;
};

const EMPTY_FORM: DraftForm = {
  title: '',
  description: '',
  location: '',
  workMode: 'ONSITE',
  applicationDeadline: '',
  showSalary: false,
};

function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type MyJob = { id: string; title: string; status: string; location?: string; applicationDeadline?: string | null };

export default function JobPostingDraft() {
  const [approved, setApproved] = useState<Requisition[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selected, setSelected] = useState<Requisition | null>(null);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const requestSequence = useRef(0);
  const [myDrafts, setMyDrafts] = useState<MyJob[]>([]);
  const [draftsBusy, setDraftsBusy] = useState(true);
  const [submitId, setSubmitId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState('');

  async function loadMyDrafts() {
    setDraftsBusy(true);
    try {
      // GET /api/jobs đã giới hạn danh sách đúng Recruiter được phân công.
      const list = await atsApi<MyJob[]>('/api/jobs');
      setMyDrafts(list.filter(job => job.status === 'DRAFT' || job.status === 'REJECTED'));
      setDraftError('');
    } catch (cause: unknown) { setDraftError(fromError(cause)); }
    finally { setDraftsBusy(false); }
  }

  async function submitMyDraft(job: MyJob) {
    if (submitId !== null) return;
    if (!window.confirm(`Gửi tin “${job.title}” cho Trưởng phòng Nhân sự phê duyệt?`)) return;
    setSubmitId(job.id);
    setDraftError('');
    try {
      const updated = await atsApi<{ status: string }>(`/api/jobs/${encodeURIComponent(job.id)}/submit-for-approval`, 'POST');
      if (updated.status !== 'PENDING_APPROVAL') throw new Error('API chưa xác nhận tin ở trạng thái Chờ duyệt.');
      setSuccess(`Đã gửi tin “${job.title}” cho Trưởng phòng Nhân sự phê duyệt.`);
      await loadMyDrafts();
    } catch (cause: unknown) { setDraftError(fromError(cause)); }
    finally { setSubmitId(null); }
  }

  useEffect(() => {
    // Lần tải đầu chỉ chạy sau effect; việc làm mới bằng nút bấm vẫn giữ nguyên.
    const timer = window.setTimeout(() => { void loadMyDrafts(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    atsApi<Requisition[]>('/api/requisitions')
      .then((rows) => {
        if (!active) return;
        setApproved(rows.filter((item) => item.status === 'APPROVED'));
      })
      .catch((cause: unknown) => {
        if (active) setError(fromError(cause));
      })
      .finally(() => {
        if (active) setLoadingList(false);
      });
    return () => {
      active = false;
      requestSequence.current += 1;
    };
  }, []);

  async function chooseRequisition(id: string) {
    const currentRequest = ++requestSequence.current;
    setSelectedId(id);
    setSelected(null);
    setForm(EMPTY_FORM);
    setError('');
    setSuccess('');
    if (!id) {
      setLoadingDetail(false);
      return;
    }

    if (!approved.some((item) => item.id === id)) {
      setSelectedId('');
      setError('Chỉ được chọn yêu cầu ở trạng thái Đã duyệt.');
      return;
    }

    setLoadingDetail(true);
    try {
      const requisition = await atsApi<Requisition>(
        `/api/requisitions/${encodeURIComponent(id)}`,
      );
      if (currentRequest !== requestSequence.current) return;
      if (requisition.status !== 'APPROVED') {
        throw new Error('Yêu cầu này không còn ở trạng thái Đã duyệt. Vui lòng chọn yêu cầu khác.');
      }
      setSelected(requisition);
      setForm({
        ...EMPTY_FORM,
        title: requisition.title || '',
        description: requisition.description || '',
      });
    } catch (cause: unknown) {
      if (currentRequest !== requestSequence.current) return;
      setSelectedId('');
      setError(fromError(cause));
    } finally {
      if (currentRequest === requestSequence.current) setLoadingDetail(false);
    }
  }

  function edit<K extends keyof DraftForm>(field: K, value: DraftForm[K]) {
    setForm((previous) => ({ ...previous, [field]: value }));
    setError('');
    setSuccess('');
  }

  const validSource = selected?.status === 'APPROVED';
  const validContent = form.title.trim().length >= 3 && form.description.trim().length >= 10;
  const validDetails = form.location.trim().length > 0 &&
    form.applicationDeadline.length > 0 && form.applicationDeadline >= todayLocal();
  const completed = Number(validSource) + Number(validContent) + Number(validDetails);
  const editingDisabled = !validSource || loadingDetail || saving;

  async function saveDraft() {
    if (saving) return;
    if (!selected || selected.status !== 'APPROVED') {
      setError('Hãy chọn một yêu cầu đã duyệt trước khi soạn tin.');
      return;
    }
    if (!validContent) {
      setError('Tiêu đề cần ít nhất 3 ký tự và mô tả công việc cần ít nhất 10 ký tự.');
      return;
    }
    if (!validDetails) {
      setError('Vui lòng nhập địa điểm và hạn nhận hồ sơ không ở quá khứ.');
      return;
    }

    setError('');
    setSuccess('');
    setSaving(true);
    try {
      // Hợp đồng API Sprint 3: BE xác thực quyền RECRUITER, nguồn APPROVED
      // và lưu đủ các trường; tuyệt đối không tự giả lập thao tác lưu.
      const result = await atsApi<{ id: string; status: string }>(
        '/api/job-posting-drafts',
        'POST',
        {
          requisitionId: selected.id,
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          workMode: form.workMode,
          applicationDeadline: form.applicationDeadline,
          showSalary: form.showSalary,
        },
      );
      if (!result.id || result.status !== 'DRAFT') {
        throw new Error('Backend chưa xác nhận bản nháp ở trạng thái DRAFT. Cần kiểm tra kết quả lưu.');
      }
      setSuccess(`Đã lưu bản nháp (mã: ${result.id}). Chọn “Gửi duyệt” trong mục Bản nháp của tôi bên dưới.`);
      await loadMyDrafts();
    } catch (cause: unknown) {
      setError(fromError(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ats-jp">
      <div className="ats-jp-breadcrumb" aria-label="Đường dẫn trang">
        <span>Tuyển dụng</span><span aria-hidden="true">/</span><strong>Soạn tin tuyển dụng</strong>
      </div>

      <header className="ats-jp-hero">
        <div>
          <p className="ats-jp-overline">QUẢN LÝ TIN TUYỂN DỤNG</p>
          <h1>Soạn tin tuyển dụng</h1>
          <p>Chọn yêu cầu đã được duyệt, điều chỉnh nội dung phù hợp với ứng viên và lưu lại dưới dạng bản nháp.</p>
        </div>
        <div className="ats-jp-hero-tag"><ShieldCheck size={17} aria-hidden="true" /> Chỉ lưu bản nháp</div>
      </header>

      {error && (
        <div className="ats-jp-feedback ats-jp-feedback--error" role="alert">
          <AlertCircle size={19} aria-hidden="true" /><span>{error}</span>
        </div>
      )}
      {success && (
        <div className="ats-jp-feedback ats-jp-feedback--success" role="status">
          <CheckCircle2 size={19} aria-hidden="true" /><span>{success}</span>
        </div>
      )}

      <section className="ats-jp-my-drafts" aria-labelledby="ats-jp-my-drafts-title">
        <div className="ats-jp-my-drafts-heading">
          <div><h2 id="ats-jp-my-drafts-title">Bản nháp của tôi</h2><p>Recruiter gửi tin đã soạn cho Trưởng phòng Nhân sự. HR Manager không tự gửi duyệt.</p></div>
          <button type="button" className="ats-jp-refresh" onClick={() => void loadMyDrafts()} disabled={draftsBusy || submitId !== null}><RefreshCw size={15}/> Làm mới</button>
        </div>
        {draftError && <div className="ats-jp-feedback ats-jp-feedback--error" role="alert"><AlertCircle size={17}/>{draftError}</div>}
        {draftsBusy ? <p className="ats-jp-muted" role="status">Đang tải bản nháp…</p> : myDrafts.length === 0 ?
          <p className="ats-jp-empty">Chưa có bản nháp cần gửi duyệt. Bạn có thể soạn tin mới bên dưới.</p> :
          <div className="ats-jp-draft-list">{myDrafts.map(job => <div className="ats-jp-draft-item" key={job.id}>
            <div><strong>{job.title}</strong><small>{job.status === 'REJECTED' ? 'Đã từ chối · kiểm tra và chỉnh sửa trước khi gửi lại' : 'Bản nháp'} · {job.location || 'Chưa rõ địa điểm'}</small></div>
            <button type="button" disabled={submitId !== null} onClick={() => void submitMyDraft(job)}><Send size={15}/>{submitId === job.id ? 'Đang gửi…' : 'Gửi duyệt HR Manager'}</button>
          </div>)}</div>}
      </section>

      <div className="ats-jp-horizontal">
        <div className="ats-jp-flow-grid" aria-label="Các bước soạn tin tuyển dụng theo thứ tự từ trái sang phải">
          <section className="ats-jp-card ats-jp-source" aria-labelledby="ats-jp-source-heading">
            <div className="ats-jp-card-head ats-jp-card-head--compact">
              <span className="ats-jp-step">01</span>
              <div>
                <h2 id="ats-jp-source-heading">Yêu cầu đã duyệt</h2>
                <p>Chỉ những yêu cầu Đã duyệt mới được dùng để soạn tin.</p>
              </div>
            </div>
            <div className="ats-jp-card-body">
              <label className="ats-jp-field">
                <span>Chọn yêu cầu nguồn <b>*</b></span>
                <select
                  value={selectedId}
                  disabled={loadingList || loadingDetail || saving}
                  onChange={(event) => { void chooseRequisition(event.target.value); }}
                >
                  <option value="">{loadingList ? 'Đang tải yêu cầu...' : '— Chọn yêu cầu đã duyệt —'}</option>
                  {approved.map((item) => (
                    <option key={item.id} value={item.id}>{item.title || item.id}</option>
                  ))}
                </select>
              </label>
              {loadingDetail && <p className="ats-jp-muted" role="status">Đang lấy nội dung yêu cầu nguồn...</p>}
              {!loadingList && approved.length === 0 && (
                <p className="ats-jp-empty" role="status">Chưa có yêu cầu Đã duyệt trong phạm vi tài khoản của bạn.</p>
              )}
              {selected ? (
                <div className="ats-jp-source-preview">
                  <div className="ats-jp-source-state"><CheckCircle2 size={16} aria-hidden="true" /> Đã duyệt</div>
                  <h3>{selected.title || 'Yêu cầu tuyển dụng'}</h3>
                  <p className="ats-jp-source-id">Mã yêu cầu: {selected.id}</p>
                  <div className="ats-jp-source-detail">
                    <strong>Mô tả từ yêu cầu nguồn</strong>
                    <p>{selected.description?.trim() || 'Yêu cầu nguồn chưa có mô tả công việc.'}</p>
                  </div>
                  {selected.requirements?.trim() && (
                    <div className="ats-jp-source-detail">
                      <strong>Yêu cầu ứng viên (tham khảo)</strong>
                      <p>{selected.requirements}</p>
                    </div>
                  )}
                </div>
              ) : !loadingDetail ? (
                <div className="ats-jp-source-empty">
                  <ClipboardCheck size={26} aria-hidden="true" />
                  <span>Chọn một yêu cầu để xem nội dung kế thừa.</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="ats-jp-card" aria-labelledby="ats-jp-content-heading">
            <div className="ats-jp-card-head">
              <span className="ats-jp-step">02</span>
              <div>
                <h2 id="ats-jp-content-heading">Nội dung tin tuyển dụng</h2>
                <p>Tiêu đề và mô tả công việc được kế thừa từ yêu cầu đã duyệt; bạn có thể biên tập lại cách diễn đạt.</p>
              </div>
              <FileText className="ats-jp-head-icon" size={21} aria-hidden="true" />
            </div>
            {!validSource && (
              <div className="ats-jp-inline-note"><ClipboardCheck size={17} aria-hidden="true" /> Chọn yêu cầu đã duyệt ở bước 01 bên trái để bắt đầu biên tập.</div>
            )}
            <div className="ats-jp-card-body">
              <label className="ats-jp-field">
                <span>Tiêu đề tin tuyển dụng <b>*</b></span>
                <input value={form.title} disabled={editingDisabled} onChange={(event) => edit('title', event.target.value)} maxLength={200} placeholder="Ví dụ: Tuyển dụng Chuyên viên Marketing" />
                <small>Tiêu đề rõ ràng, phù hợp với vị trí đang tuyển.</small>
              </label>
              <label className="ats-jp-field">
                <span>Mô tả công việc <b>*</b></span>
                <textarea value={form.description} disabled={editingDisabled} rows={9} onChange={(event) => edit('description', event.target.value)} placeholder="Mô tả công việc sẽ được kế thừa từ yêu cầu đã duyệt..." />
                <small>Bạn có thể chỉnh ngôn ngữ để dễ hiểu và thu hút ứng viên. Tối thiểu 10 ký tự.</small>
              </label>
            </div>
          </section>

          <section className="ats-jp-card" aria-labelledby="ats-jp-info-heading">
            <div className="ats-jp-card-head">
              <span className="ats-jp-step">03</span>
              <div>
                <h2 id="ats-jp-info-heading">Thông tin đăng tuyển</h2>
                <p>Thiết lập địa điểm, hình thức làm việc và thời hạn nhận hồ sơ.</p>
              </div>
              <MapPin className="ats-jp-head-icon" size={21} aria-hidden="true" />
            </div>
            <div className="ats-jp-card-body">
              <div className="ats-jp-two-cols">
                <label className="ats-jp-field">
                  <span>Địa điểm làm việc <b>*</b></span>
                  <input value={form.location} disabled={editingDisabled} maxLength={200} onChange={(event) => edit('location', event.target.value)} placeholder="Ví dụ: Hà Nội" />
                </label>
                <label className="ats-jp-field">
                  <span>Hình thức làm việc <b>*</b></span>
                  <select value={form.workMode} disabled={editingDisabled} onChange={(event) => edit('workMode', event.target.value as WorkMode)}>
                    <option value="ONSITE">Tại văn phòng</option>
                    <option value="HYBRID">Kết hợp (Hybrid)</option>
                    <option value="REMOTE">Làm việc từ xa</option>
                  </select>
                </label>
              </div>
              <label className="ats-jp-field">
                <span>Hạn nhận hồ sơ <b>*</b></span>
                <div className="ats-jp-date-wrap">
                  <CalendarDays size={18} aria-hidden="true" />
                  <input type="date" value={form.applicationDeadline} min={todayLocal()} disabled={editingDisabled} onChange={(event) => edit('applicationDeadline', event.target.value)} />
                </div>
                <small>Hạn nhận hồ sơ phải từ hôm nay trở đi.</small>
              </label>
              <label className={`ats-jp-salary-toggle ${editingDisabled ? 'ats-jp-salary-toggle--disabled' : ''}`}>
                <span className="ats-jp-toggle-text"><strong>Hiển thị mức lương trên tin đăng</strong><small>Chỉ quyết định có công khai thông tin lương hay không.</small></span>
                <input type="checkbox" checked={form.showSalary} disabled={editingDisabled} onChange={(event) => edit('showSalary', event.target.checked)} />
                <span className="ats-jp-switch" aria-hidden="true" />
              </label>
            </div>
          </section>
        </div>

          <section className="ats-jp-card ats-jp-complete" aria-labelledby="ats-jp-finish-heading">
            <div className="ats-jp-card-head ats-jp-card-head--compact">
              <span className="ats-jp-step ats-jp-step--finish"><Save size={18} aria-hidden="true" /></span>
              <div>
                <h2 id="ats-jp-finish-heading">Hoàn tất soạn tin</h2>
                <p>Kiểm tra trước khi lưu bản nháp.</p>
              </div>
            </div>
            <div className="ats-jp-card-body">
              <div className="ats-jp-progress-title"><strong>Mức độ hoàn thiện</strong><span>{completed}/3</span></div>
              <div className="ats-jp-progress" aria-label={`${completed} trên 3 điều kiện hợp lệ`}>
                <span style={{ width: `${(completed / 3) * 100}%` }} />
              </div>
              <ul className="ats-jp-checklist">
                <li className={validSource ? 'is-complete' : ''}><CheckCircle2 size={17} aria-hidden="true" /> Yêu cầu nguồn đã duyệt</li>
                <li className={validContent ? 'is-complete' : ''}><CheckCircle2 size={17} aria-hidden="true" /> Tiêu đề và mô tả hợp lệ</li>
                <li className={validDetails ? 'is-complete' : ''}><CheckCircle2 size={17} aria-hidden="true" /> Địa điểm và hạn nhận hồ sơ</li>
              </ul>
              <button className="ats-jp-save" type="button" disabled={!validSource || saving || loadingDetail} onClick={() => { void saveDraft(); }}>
                <Save size={18} aria-hidden="true" /> {saving ? 'Đang lưu bản nháp...' : 'Lưu bản nháp tin tuyển dụng'}
              </button>
              <p className="ats-jp-save-note"><ShieldCheck size={15} aria-hidden="true" /> Tin được lưu ở trạng thái Nháp, không xuất bản tự động.</p>
            </div>
          </section>
      </div>
    </main>
  );
}
