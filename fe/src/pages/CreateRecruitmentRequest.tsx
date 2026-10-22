import './create-recruitment-layout.css';
import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, FileText, Info, Save, Send, Wallet } from 'lucide-react';
import './CreateRecruitmentRequest.css';
import SalaryVndInput from '../components/SalaryVndInput';

type Department = { id: string; name: string; isActive: boolean; children: Department[] };
type JobTitle = { id: string; name: string; code: string; level: string };
type FormData = {
  jobTitleId: string;
  departmentId: string;
  headcount: number;
  reason: 'NEW' | 'REPLACEMENT';
  proposedSalaryMin: string;
  proposedSalaryMax: string;
  targetDate: string;
  description: string;
  requirements: string;
  salaryExplanation: string;
};
type ApiResult<T> = { success: boolean; data?: T; error?: { message?: string } };
type HeadcountAvailability = {
  departmentId: string;
  year: number;
  allocatedHeadcount: number | null;
  approvedHeadcount: number;
  remainingHeadcount: number | null;
};
type HeadcountAvailabilityState = {
  key: string;
  data?: HeadcountAvailability;
  error?: string;
};

type RequisitionSummary = {
  id: string;
  title: string;
  status: string;
  hiringManagerId: string | null;
  department?: { name: string } | null;
};
type SavedRequisition = RequisitionSummary & {
  jobTitleId: string | null;
  departmentId: string;
  headcount: number;
  reason: string | null;
  proposedSalaryMin: number | null;
  proposedSalaryMax: number | null;
  targetDate: string | null;
  description: string | null;
  requirements: string | null;
  salaryExplanation: string | null;
};

const API_URL = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const initialData: FormData = {
  jobTitleId: '', departmentId: '', headcount: 1, reason: 'NEW',
  proposedSalaryMin: '', proposedSalaryMax: '', targetDate: '',
  description: '', requirements: '', salaryExplanation: '',
};
function flattenDepartments(nodes: Department[]): Department[] {
  return nodes.flatMap(node => [node, ...flattenDepartments(node.children || [])]);
}

export default function CreateRecruitmentRequest() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const resubmitId = searchParams.get('resubmit');
  const restoringIdRef = useRef<string | null>(null);
  // S3-05: nut sao chep chi hien cho Truong bo phan; BE van kiem tra quyen thuc.
  const canCopyExisting = (() => {
    try {
      const stored = sessionStorage.getItem('atsUser');
      const account = stored ? JSON.parse(stored) as { roles?: string[] } : null;
      return Array.isArray(account?.roles) && account.roles.includes('HIRING_MANAGER');
    } catch { return false; }
  })();

  const [form, setForm] = useState<FormData>(initialData);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [editingReturned, setEditingReturned] = useState(false);
  const [drafts, setDrafts] = useState<RequisitionSummary[]>([]);
  const [showDrafts, setShowDrafts] = useState(false);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [headcountAvailabilityState, setHeadcountAvailabilityState] = useState<HeadcountAvailabilityState | null>(null);
  const headcountYear = form.targetDate
    ? Number(form.targetDate.slice(0, 4))
    : new Date().getFullYear();
  const headcountAvailabilityKey = form.departmentId
    ? `${form.departmentId}:${headcountYear}`
    : '';
  const currentHeadcountAvailability = headcountAvailabilityState?.key === headcountAvailabilityKey
    ? headcountAvailabilityState.data
    : null;
  const headcountAvailabilityError = headcountAvailabilityState?.key === headcountAvailabilityKey
    ? headcountAvailabilityState.error || ''
    : '';
  const headcountAvailabilityLoading = Boolean(form.departmentId) &&
    headcountAvailabilityState?.key !== headcountAvailabilityKey;

  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = sessionStorage.getItem('accessToken');
    if (!token) throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json() as ApiResult<T>;
    if (!response.ok || !result.success || result.data === undefined) {
      throw new Error(result.error?.message || 'Không thể kết nối với máy chủ.');
    }
    return result.data;
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      request<Department[]>('/api/departments'),
      request<JobTitle[]>('/api/job-titles/options'),
      request<{ id: string; departmentId: string | null }>('/api/users/me'),
    ]).then(([tree, jobTitles, profile]) => {
      if (!active) return;
      setDepartments(flattenDepartments(tree).filter(d => d.isActive));
      setTitles(jobTitles);
      setCurrentUserId(profile.id);
      if (profile.departmentId) setForm(previous => ({ ...previous, departmentId: profile.departmentId || '' }));
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không tải được dữ liệu.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!form.departmentId) return;

    let active = true;

    request<HeadcountAvailability>(
      `/api/recruitment-budget/headcount/requisition-availability?departmentId=${encodeURIComponent(form.departmentId)}&year=${headcountYear}`,
    ).then(availability => {
      if (active) setHeadcountAvailabilityState({ key: headcountAvailabilityKey, data: availability });
    }).catch(e => {
      if (active) {
        setHeadcountAvailabilityState({
          key: headcountAvailabilityKey,
          error: e instanceof Error ? e.message : 'Không tải được chỉ tiêu headcount.',
        });
      }
    });

    return () => { active = false; };
  }, [form.departmentId, headcountYear, headcountAvailabilityKey]);

  async function showSavedDrafts() {
    setError(''); setNotice(''); setLoadingDrafts(true); setShowDrafts(true);
    try {
      const items = await request<RequisitionSummary[]>('/api/requisitions');
      setDrafts(items.filter(item =>
        (item.status === 'DRAFT' || item.status === 'CHANGES_REQUESTED') && item.hiringManagerId === currentUserId
      ));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách bản nháp.');
    } finally {
      setLoadingDrafts(false);
    }
  }

  async function openDraft(id: string) {
    setError(''); setNotice(''); setLoadingDrafts(true);
    try {
      const item = await request<SavedRequisition>(`/api/requisitions/${encodeURIComponent(id)}`);
      if (!['DRAFT', 'CHANGES_REQUESTED'].includes(item.status) || item.hiringManagerId !== currentUserId) {
        throw new Error('Chỉ có thể mở bản nháp hoặc yêu cầu cần bổ sung do chính bạn tạo.');
      }
      setForm({
        jobTitleId: item.jobTitleId || '',
        departmentId: item.departmentId,
        headcount: item.headcount,
        reason: item.reason === 'REPLACEMENT' ? 'REPLACEMENT' : 'NEW',
        proposedSalaryMin: item.proposedSalaryMin == null ? '' : String(item.proposedSalaryMin),
        proposedSalaryMax: item.proposedSalaryMax == null ? '' : String(item.proposedSalaryMax),
        targetDate: item.targetDate ? item.targetDate.slice(0, 10) : '',
        description: item.description || '',
        requirements: item.requirements || '',
        salaryExplanation: item.salaryExplanation || '',
      });
      setEditingDraftId(item.id);
      setEditingReturned(item.status === 'CHANGES_REQUESTED');
      if (item.status === 'CHANGES_REQUESTED') {
        setSearchParams({ resubmit: item.id }, { replace: true });
      } else if (resubmitId) {
        setSearchParams({}, { replace: true });
      }
      setShowDrafts(false);
      setNotice(item.status === 'CHANGES_REQUESTED'
        ? `Đã mở yêu cầu cần bổ sung ${item.id}. Cập nhật thông tin rồi nhấn Gửi yêu cầu phê duyệt để nộp lại chính yêu cầu này.`
        : `Đã mở bản nháp ${item.id}. Điền thông tin còn thiếu, sau đó nhấn Gửi yêu cầu phê duyệt.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được bản nháp.');
    } finally {
      setLoadingDrafts(false);
    }
  }

  useEffect(() => {
    if (!resubmitId || !currentUserId || editingDraftId === resubmitId || restoringIdRef.current === resubmitId) return;
    restoringIdRef.current = resubmitId;
    void openDraft(resubmitId).finally(() => {
      restoringIdRef.current = null;
    });
    // Khoi phuc yeu cau sau khi tai lai trang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resubmitId, currentUserId, editingDraftId]);

  function startNewRequest() {
    setSearchParams({}, { replace: true });
    setEditingDraftId(null);
    setEditingReturned(false);
    setForm(initialData);
    setError('');
    setNotice('Đang tạo yêu cầu mới.');
  }

  function update(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm(previous => ({ ...previous, [name]: name === 'headcount' ? Number(value) : value }));
  }

  async function submit(isDraft: boolean) {
    setError(''); setNotice('');
    if (resubmitId && (editingDraftId !== resubmitId || !editingReturned)) {
      setError(`Chưa tải được yêu cầu cần bổ sung ${resubmitId}. Hãy mở lại yêu cầu trước khi gửi.`);
      return;
    }
    if (isDraft && editingReturned) {
      setError('Yêu cầu đã trả về để bổ sung. Vui lòng cập nhật thông tin và gửi lại phê duyệt, không chuyển thành bản nháp.');
      return;
    }
    if (!form.jobTitleId || !form.departmentId) {
      setError('Vui lòng chọn chức danh và phòng ban.'); return;
    }
    if (!Number.isInteger(form.headcount) || form.headcount < 1) {
      setError('Số lượng tuyển phải là số nguyên dương.'); return;
    }
    const min = form.proposedSalaryMin === '' ? undefined : Number(form.proposedSalaryMin);
    const max = form.proposedSalaryMax === '' ? undefined : Number(form.proposedSalaryMax);
    if ((min !== undefined && min < 0) || (max !== undefined && max < 0) ||
        (min !== undefined && max !== undefined && min > max)) {
      setError('Dải lương đề xuất không hợp lệ.'); return;
    }
    if (!isDraft && (!form.targetDate || form.targetDate < today() ||
        min === undefined || max === undefined || !form.description.trim() || !form.requirements.trim())) {
      setError('Vui lòng điền đủ lương, ngày cần người, mô tả và yêu cầu ứng viên trước khi gửi.'); return;
    }
    if (form.targetDate && form.targetDate < today()) {
      setError('Ngày cần nhân sự không được ở quá khứ.'); return;
    }
    setSaving(true);
    try {
      const data = await request<{ id: string }>(editingDraftId ? `/api/requisitions/${encodeURIComponent(editingDraftId)}` : '/api/requisitions', editingDraftId ? 'PUT' : 'POST', {
        jobTitleId: form.jobTitleId,
        departmentId: form.departmentId,
        headcount: form.headcount,
        reason: form.reason,
        ...(min !== undefined ? { proposedSalaryMin: min } : {}),
        ...(max !== undefined ? { proposedSalaryMax: max } : {}),
        ...(form.targetDate ? { targetDate: form.targetDate } : {}),
        description: form.description,
        requirements: form.requirements,
        salaryExplanation: form.salaryExplanation,
        isDraft,
      });
      setNotice(isDraft ? `Đã lưu bản nháp (${data.id}). Bạn có thể bổ sung rồi gửi phê duyệt ngay trên trang này.` : `Đã gửi yêu cầu tuyển dụng (${data.id}). Trạng thái: Chờ phê duyệt.`);
      if (isDraft) {
        // Giữ mã bản nháp để lần lưu/gửi tiếp theo dùng PUT thay vì tạo bản ghi mới.
        setEditingDraftId(data.id);
      } else {
        if (editingReturned) setSearchParams({}, { replace: true });
        setEditingDraftId(null);
        setEditingReturned(false);
        setForm(initialData);
        setDrafts(previous => previous.filter(draft => draft.id !== data.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được yêu cầu tuyển dụng.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ats-req-page">
      <div className="ats-req-shell">
        <div className="ats-req-breadcrumb" aria-label="Vị trí hiện tại">
          <span>Tuyển dụng</span>
          <ChevronRight size={14} aria-hidden="true" />
          <span>Yêu cầu tuyển dụng</span>
          <ChevronRight size={14} aria-hidden="true" />
          <strong>Tạo mới</strong>
        </div>

        <header className="ats-req-header">
          <div>
            <span className="ats-req-eyebrow"><ClipboardList size={15} aria-hidden="true" /> QUẢN LÝ TUYỂN DỤNG</span>
            <h1>Tạo yêu cầu tuyển dụng</h1>
            <p>Điền thông tin vị trí cần tuyển. Bạn có thể lưu bản nháp hoặc gửi yêu cầu phê duyệt.</p>
          </div>
          <button className="ats-req-btn ats-req-btn--back ats-req-header-back" type="button" onClick={() => navigate(-1)}><ArrowLeft size={17} aria-hidden="true" /> Quay lại</button>
        </header>


        {error && <div className="ats-req-alert ats-req-alert--error" role="alert"><Info size={19} aria-hidden="true" /><span>{error}</span></div>}
        {notice && <div className="ats-req-alert ats-req-alert--success" role="status"><CheckCircle2 size={19} aria-hidden="true" /><span>{notice}</span></div>}

        {loading ? (
          <div className="ats-req-loading" role="status">Đang tải danh mục chức danh và phòng ban...</div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); void submit(false); }}>

            <div className="ats-req-content">
              <div className="ats-req-form-column">
                <section className="ats-req-card">
                  <div className="ats-req-section-heading">
                    <span className="ats-req-section-icon"><ClipboardList size={21} aria-hidden="true" /></span>
                    <div><h2>Thông tin tuyển dụng</h2><p>Xác định vị trí, phòng ban và nhu cầu nhân sự.</p></div>
                  </div>
                  <div className="ats-req-fields ats-req-fields--two">
                    <label className="ats-req-field">
                      <span>Chức danh cần tuyển <em>*</em></span>
                      <select name="jobTitleId" value={form.jobTitleId} onChange={update} required>
                        <option value="">Chọn chức danh</option>
                        {titles.map(t => <option key={t.id} value={t.id}>{t.name} – {t.level}</option>)}
                      </select>
                    </label>
                    <label className="ats-req-field">
                      <span>Phòng ban <em>*</em></span>
                      <select name="departmentId" value={form.departmentId} onChange={update} required>
                        <option value="">Chọn phòng ban</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </label>
                    <label className="ats-req-field">
                      <span>Số lượng cần tuyển <em>*</em></span>
                      <input type="number" min={1} name="headcount" value={form.headcount} onChange={update} required />
                    </label>
                    <label className="ats-req-field">
                      <span>Lý do tuyển <em>*</em></span>
                      <select name="reason" value={form.reason} onChange={update} required>
                        <option value="NEW">Tăng mới</option>
                        <option value="REPLACEMENT">Thay thế</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="ats-req-card">
                  <div className="ats-req-section-heading">
                    <span className="ats-req-section-icon"><Wallet size={21} aria-hidden="true" /></span>
                    <div><h2>Ngân sách và thời gian</h2><p>Nhập dải lương đề xuất và thời điểm cần nhân sự.</p></div>
                  </div>
                  <div className="ats-req-fields ats-req-fields--two">
                    <label className="ats-req-field">
                      <span>Lương tối thiểu đề xuất (VNĐ)</span>
                      <SalaryVndInput name="proposedSalaryMin" label="Lương tối thiểu đề xuất" value={form.proposedSalaryMin} onValueChange={value => setForm(previous => ({ ...previous, proposedSalaryMin: value }))} placeholder="Ví dụ: 12.000.000" />
                    </label>
                    <label className="ats-req-field">
                      <span>Lương tối đa đề xuất (VNĐ)</span>
                      <SalaryVndInput name="proposedSalaryMax" label="Lương tối đa đề xuất" value={form.proposedSalaryMax} onValueChange={value => setForm(previous => ({ ...previous, proposedSalaryMax: value }))} placeholder="Ví dụ: 18.000.000" />
                    </label>
                    <label className="ats-req-field ats-req-field--full">
                      <span>Ngày cần nhân sự</span>
                      <span className="ats-req-input-with-icon"><CalendarDays size={18} aria-hidden="true" /><input type="date" min={today()} name="targetDate" value={form.targetDate} onChange={update} /></span>
                    </label>
                    {form.departmentId && (
                      <div
                        className={`ats-req-field--full ats-req-alert ${headcountAvailabilityError || (currentHeadcountAvailability?.remainingHeadcount != null && form.headcount > currentHeadcountAvailability.remainingHeadcount) ? 'ats-req-alert--warning' : 'ats-req-alert--info'}`}
                        role={headcountAvailabilityError || (currentHeadcountAvailability?.remainingHeadcount != null && form.headcount > currentHeadcountAvailability.remainingHeadcount) ? 'alert' : 'status'}
                      >
                        <Info size={19} aria-hidden="true" />
                        <span>
                          {headcountAvailabilityLoading
                            ? 'Đang tải chỉ tiêu headcount...'
                            : headcountAvailabilityError
                              ? headcountAvailabilityError
                              : currentHeadcountAvailability?.allocatedHeadcount == null
                                ? 'Phòng ban chưa có chỉ tiêu headcount cho năm tuyển dụng. Yêu cầu vẫn có thể gửi để phê duyệt.'
                                : currentHeadcountAvailability?.remainingHeadcount != null && form.headcount > currentHeadcountAvailability.remainingHeadcount
                                    ? `Yêu cầu vượt chỉ tiêu còn lại ${currentHeadcountAvailability.remainingHeadcount} người của năm ${currentHeadcountAvailability.year}. Yêu cầu vẫn có thể gửi; phê duyệt vượt chỉ tiêu cần Trưởng phòng Nhân sự xác nhận và nêu lý do.`
                                    : `Headcount còn lại năm ${currentHeadcountAvailability?.year}: ${currentHeadcountAvailability?.remainingHeadcount} người (đã duyệt ${currentHeadcountAvailability?.approvedHeadcount}/${currentHeadcountAvailability?.allocatedHeadcount}).`}
                        </span>
                      </div>
                    )}
                    <label className="ats-req-field ats-req-field--full">
                      <span>Giải trình nếu mức lương vượt khung chức danh</span>
                      <textarea rows={3} name="salaryExplanation" value={form.salaryExplanation} onChange={update} placeholder="Nêu lý do đề xuất mức lương khác với dải lương chuẩn (nếu có)..." />
                    </label>
                  </div>
                </section>

                <section className="ats-req-card">
                  <div className="ats-req-section-heading">
                    <span className="ats-req-section-icon"><FileText size={21} aria-hidden="true" /></span>
                    <div><h2>Mô tả và yêu cầu vị trí</h2><p>Thông tin giúp bộ phận nhân sự hiểu rõ nhu cầu tuyển dụng.</p></div>
                  </div>
                  <div className="ats-req-fields">
                    <label className="ats-req-field">
                      <span>Mô tả công việc</span>
                      <textarea rows={5} name="description" value={form.description} onChange={update} placeholder="Mô tả nhiệm vụ chính, phạm vi công việc và trách nhiệm của vị trí..." />
                    </label>
                    <label className="ats-req-field">
                      <span>Yêu cầu ứng viên</span>
                      <textarea rows={5} name="requirements" value={form.requirements} onChange={update} placeholder="Nhập kỹ năng, kinh nghiệm, chuyên môn và những tiêu chí cần thiết..." />
                    </label>
                  </div>
                </section>
              </div>

              <aside className="ats-req-aside" aria-label="Hướng dẫn lập yêu cầu">
                <section className="ats-req-draft-area" aria-label="Bản nháp yêu cầu tuyển dụng">
                  <div className="ats-req-draft-toolbar">
                    <div>
                      <strong>{editingReturned ? 'Đang bổ sung yêu cầu' : editingDraftId ? 'Đang chỉnh sửa bản nháp' : 'Bản nháp & yêu cầu cần bổ sung'}</strong>
                      <p>{editingDraftId ? `Mã yêu cầu: ${editingDraftId}` : 'Mở bản nháp hoặc yêu cầu bị trả về để bổ sung và gửi lại, không tạo yêu cầu trùng.'}</p>
                    </div>
                    <div className="ats-req-draft-buttons">
                      {canCopyExisting && (
                        <button type="button" className="ats-req-btn ats-req-btn--draft" onClick={() => navigate('/recruitment-requests/copy')}>
                          Sao chép yêu cầu đã có
                        </button>
                      )}
                      {editingDraftId && !editingReturned && <button type="button" className="ats-req-btn" onClick={startNewRequest}>Tạo mới</button>}
                      <button type="button" className="ats-req-btn ats-req-btn--draft" disabled={loadingDrafts || saving || loading || !currentUserId} onClick={() => void showSavedDrafts()}>
                        {loadingDrafts ? 'Đang tải...' : 'Xem bản nháp / cần bổ sung'}
                      </button>
                    </div>
                  </div>
                  {showDrafts && (
                    <div className="ats-req-draft-list">
                      {loadingDrafts ? <p>Đang tải danh sách yêu cầu có thể sửa...</p> : drafts.length === 0 ?
                        <p>Không có bản nháp hoặc yêu cầu cần bổ sung của bạn.</p> : drafts.map(draft => (
                          <div className="ats-req-draft-row" key={draft.id}>
                            <div><strong>{draft.title || 'Yêu cầu tuyển dụng'}</strong><span>{draft.department?.name || 'Chưa có phòng ban'} · {draft.id} · {draft.status === 'CHANGES_REQUESTED' ? 'Cần bổ sung' : 'Bản nháp'}</span></div>
                            <button type="button" className="ats-req-btn ats-req-btn--draft" disabled={loadingDrafts} onClick={() => void openDraft(draft.id)}>{draft.status === 'CHANGES_REQUESTED' ? 'Bổ sung và nộp lại' : 'Mở bản nháp'}</button>
                          </div>
                        ))}
                    </div>
                  )}
                </section>
                <div className="ats-req-guide-card">
                  <span className="ats-req-guide-icon"><Info size={20} aria-hidden="true" /></span>
                  <h2>Lưu ý trước khi gửi</h2>
                  <ul>
                    <li>Chọn đúng chức danh và phòng ban cần tuyển.</li>
                    <li>Số lượng tuyển phải lớn hơn 0.</li>
                    <li>Điền dải lương, ngày cần nhân sự, mô tả và yêu cầu ứng viên trước khi gửi duyệt.</li>
                    <li>Nếu lương vượt dải chuẩn của chức danh, cần có giải trình.</li>
                  </ul>
                  <div className="ats-req-guide-note"><Save size={17} aria-hidden="true" /><span><strong>Chưa hoàn tất?</strong> Bạn có thể lưu nháp để tiếp tục xử lý sau.</span></div>
                </div>
              <footer className="ats-req-footer">
              <div className="ats-req-footer-copy"><strong>Hoàn tất yêu cầu</strong><span>Kiểm tra thông tin trước khi gửi phê duyệt.</span></div>
              <div className="ats-req-actions">

                <button className="ats-req-btn ats-req-btn--draft" type="button" disabled={saving || editingReturned} onClick={() => void submit(true)}><Save size={17} aria-hidden="true" /> {saving ? 'Đang lưu...' : 'Lưu nháp'}</button>
                <button className="ats-req-btn ats-req-btn--submit" type="submit" disabled={saving || Boolean(resubmitId && editingDraftId !== resubmitId)}><Send size={17} aria-hidden="true" /> {saving ? 'Đang lưu...' : 'Gửi yêu cầu phê duyệt'}</button>
              </div>
            </footer>
              </aside>
            </div>

          </form>
        )}
      </div>
    </main>
  );
}
