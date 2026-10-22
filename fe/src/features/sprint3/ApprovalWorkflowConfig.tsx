import { useEffect, useMemo, useState } from 'react';
import { atsApi, flatDepartments, fromError } from './api';
import type { Department } from './api';
import './approval-workflow.css';

type Approver = {
  id: string;
  fullName: string;
  email: string;
  roles?: string[];
  isActive?: boolean;
};
type Band = { id: number; minSalary: string; maxSalary: string; approverIds: string[] };
type SavedWorkflow = {
  id: string;
  departmentId: string;
  version: number;
  ranges: { minSalary: number; maxSalary: number | null; approverIds: string[] }[];
};

type MoneyInputProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
};

const moneyFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const displayMoney = (value: string) => value === '' ? '' : moneyFormatter.format(Number(value));
const createBand = (id: number, minSalary = ''): Band => ({
  id, minSalary, maxSalary: '', approverIds: [''],
});

function MoneyInput({ id, label, value, onChange, placeholder, hint }: MoneyInputProps) {
  const [editing, setEditing] = useState(false);
  return (
    <label className="aw-field" htmlFor={id}>
      <span className="aw-field-label">{label}</span>
      <span className="aw-money-control">
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={editing ? value : displayMoney(value)}
          placeholder={placeholder || 'Nhập số tiền'}
          onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
          onBlur={() => setEditing(false)}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
        />
        <span className="aw-money-unit">VNĐ</span>
      </span>
      {hint && <span className="aw-field-hint">{hint}</span>}
    </label>
  );
}

export default function ApprovalWorkflowConfig() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [existing, setExisting] = useState<SavedWorkflow[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [ranges, setRanges] = useState<Band[]>([createBand(1, '0')]);
  const [previewSalary, setPreviewSalary] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [departmentIssue, setDepartmentIssue] = useState('');
  const [approverIssue, setApproverIssue] = useState('');
  const [workflowIssue, setWorkflowIssue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load independent resources separately. Missing Sprint 3 API must not hide departments.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [depts, users, workflows] = await Promise.allSettled([
        atsApi<Department[]>('/api/departments'),
        atsApi<Approver[]>('/api/users?role=APPROVER'),
        atsApi<SavedWorkflow[]>('/api/approval-workflows'),
      ]);
      if (!active) return;
      if (depts.status === 'fulfilled' && Array.isArray(depts.value)) {
        setDepartments(flatDepartments(depts.value).filter(d => d.isActive !== false));
      } else {
        setDepartmentIssue(depts.status === 'rejected' ? fromError(depts.reason) : 'Dữ liệu phòng ban không hợp lệ.');
      }
      if (users.status === 'fulfilled' && Array.isArray(users.value)) {
        // A legacy /api/users implementation may return every user regardless of the role query.
        setApprovers(users.value.filter(u => u.isActive !== false &&
          (!Array.isArray(u.roles) || u.roles.includes('APPROVER'))));
      } else {
        setApproverIssue(users.status === 'rejected' ? fromError(users.reason) : 'Dữ liệu người duyệt không hợp lệ.');
      }
      if (workflows.status === 'fulfilled' && Array.isArray(workflows.value)) {
        setExisting(workflows.value);
      } else {
        setWorkflowIssue(workflows.status === 'rejected' ? fromError(workflows.reason) : 'Dữ liệu luồng duyệt không hợp lệ.');
      }
      setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, []);

  const relevant = useMemo(() => existing.find(w => w.departmentId === departmentId), [existing, departmentId]);
  const preview = useMemo(() => {
    if (!previewSalary || !Number.isSafeInteger(Number(previewSalary))) return null;
    const salary = Number(previewSalary);
    return ranges.find(b => b.minSalary !== '' && salary >= Number(b.minSalary) &&
      (b.maxSalary === '' || salary <= Number(b.maxSalary))) || null;
  }, [previewSalary, ranges]);
  const selectedDepartment = departments.find(d => d.id === departmentId)?.name.replace(/^(—\s*)+/, '') || '';
  const maxSteps = Math.max(...ranges.map(b => b.approverIds.length), 1);

  function updateRange(id: number, field: 'minSalary' | 'maxSalary', value: string) {
    setRanges(old => old.map(r => r.id === id ? { ...r, [field]: value } : r));
    setError('');
  }
  function updateApprover(id: number, index: number, value: string) {
    setRanges(old => old.map(r => r.id !== id ? r : {
      ...r, approverIds: r.approverIds.map((x, i) => i === index ? value : x),
    }));
    setError('');
  }
  function selectDepartment(id: string) {
    setDepartmentId(id);
    setError('');
    setMessage('');
    setPreviewSalary('');
    const saved = existing.find(workflow => workflow.departmentId === id);
    setRanges(saved
      ? saved.ranges.map((range, index) => ({
        id: index + 1,
        minSalary: String(range.minSalary),
        maxSalary: range.maxSalary === null ? '' : String(range.maxSalary),
        approverIds: [...range.approverIds],
      }))
      : [createBand(1, '0')]);
  }
  function addRange() {
    const last = ranges[ranges.length - 1];
    const nextMin = last && last.maxSalary !== '' && Number.isSafeInteger(Number(last.maxSalary))
      ? String(Number(last.maxSalary) + 1) : '';
    setRanges(old => [...old, createBand(Math.max(...old.map(x => x.id), 0) + 1, nextMin)]);
    setError('');
  }
  function validate(): string {
    if (!departmentId) return 'Hãy chọn phòng ban cần áp dụng luồng phê duyệt.';
    for (const [index, r] of ranges.entries()) {
      const n = index + 1;
      if (r.minSalary === '' || !Number.isSafeInteger(Number(r.minSalary)) || Number(r.minSalary) < 0) {
        return `Dải lương ${n}: mức bắt đầu phải là số nguyên không âm.`;
      }
      if (r.maxSalary !== '' && (!Number.isSafeInteger(Number(r.maxSalary)) || Number(r.maxSalary) < Number(r.minSalary))) {
        return `Dải lương ${n}: mức kết thúc phải lớn hơn hoặc bằng mức bắt đầu.`;
      }
      if (r.approverIds.length < 1 || r.approverIds.length > 3) {
        return `Dải lương ${n}: chỉ được cấu hình từ 1 đến 3 cấp phê duyệt.`;
      }
      if (r.approverIds.some(id => !id)) return `Dải lương ${n}: hãy chọn đủ người phê duyệt ở tất cả các cấp.`;
      if (new Set(r.approverIds).size !== r.approverIds.length) {
        return `Dải lương ${n}: không được chọn trùng một người ở nhiều cấp.`;
      }
    }
    const sorted = [...ranges].sort((a, b) => Number(a.minSalary) - Number(b.minSalary));
    if (Number(sorted[0]?.minSalary) !== 0) return 'Dải lương đầu tiên phải bắt đầu từ 0 VNĐ.';
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (prev.maxSalary === '') return 'Chỉ dải lương cuối cùng mới được để mức kết thúc không giới hạn.';
      if (Number(next.minSalary) <= Number(prev.maxSalary)) return 'Các dải lương đang chồng lấn. Hãy kiểm tra lại điểm bắt đầu/kết thúc.';
      if (Number(next.minSalary) > Number(prev.maxSalary) + 1) return 'Các dải lương có khoảng trống. Mọi mức lương phải có luồng duyệt phù hợp.';
      if (next.approverIds.length < prev.approverIds.length) {
        return 'Dải lương cao hơn không được có ít cấp phê duyệt hơn dải lương thấp.';
      }
    }
    if (sorted[sorted.length - 1]?.maxSalary !== '') return 'Dải lương cao nhất phải để trống mức kết thúc (không giới hạn).';
    return '';
  }
  async function save() {
    setError(''); setMessage('');
    if (workflowIssue) {
      setError('Không thể lưu vì chưa tải được cấu hình đã lưu. Hãy tải lại trang và thử lại.');
      return;
    }
    const issue = validate();
    if (issue) { setError(issue); return; }
    setSaving(true);
    try {
      const saved = await atsApi<SavedWorkflow>('/api/approval-workflows', 'POST', {
        departmentId,
        activation: 'NEW_REQUESTS_ONLY',
        ranges: ranges.map(r => ({
          minSalary: Number(r.minSalary),
          maxSalary: r.maxSalary === '' ? null : Number(r.maxSalary),
          approverIds: r.approverIds,
        })),
      });
      setExisting(old => [...old.filter(w => w.departmentId !== departmentId), saved]);
      setWorkflowIssue('');
      setMessage(`Đã lưu phiên bản ${saved.version}. Cấu hình mới chỉ áp dụng cho yêu cầu tuyển dụng tạo sau thời điểm lưu.`);
    } catch (e) { setError(fromError(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="aw-page">
      <header className="aw-head">
        <div>
          <p className="aw-eyebrow">QUẢN TRỊ TUYỂN DỤNG <span aria-hidden="true">/</span> QUY TRÌNH PHÊ DUYỆT</p>
          <h1>Cấu hình luồng phê duyệt nhiều cấp</h1>
          <p className="aw-intro">Quy định ai cần phê duyệt yêu cầu tuyển dụng theo từng phòng ban và mức lương đề xuất.</p>
        </div>
        <div className="aw-version-tag">Chỉ áp dụng cho yêu cầu mới</div>
      </header>

      <div className="aw-summary" aria-label="Tóm tắt cấu hình">
        <div><span className="aw-summary-icon">▣</span><span><b>{ranges.length}</b><small>Dải lương</small></span></div>
        <div><span className="aw-summary-icon">⇢</span><span><b>{maxSteps}/3</b><small>Cấp duyệt tối đa</small></span></div>
        <div><span className="aw-summary-icon">◎</span><span><b>{selectedDepartment || 'Chưa chọn'}</b><small>Phòng ban áp dụng</small></span></div>
      </div>

      {workflowIssue && <div className="aw-notice" role="alert">
        <span className="aw-notice-icon" aria-hidden="true">!</span>
        <div><strong>Không tải được cấu hình luồng đã lưu</strong>
          <p>Không thể xác định cấu hình hiện tại. Hãy tải lại trang trước khi chỉnh sửa hoặc lưu để tránh tạo phiên bản dựa trên dữ liệu chưa tải.</p>
          <details><summary>Chi tiết kỹ thuật</summary><p>{workflowIssue}</p></details>
        </div>
      </div>}

      {error && <div className="aw-feedback aw-feedback-error" role="alert"><b>Kiểm tra lại thông tin</b><p>{error}</p></div>}
      {message && <div className="aw-feedback aw-feedback-success" role="status"><b>Lưu thành công</b><p>{message}</p></div>}

      <section className="aw-panel" aria-labelledby="aw-step-one">
        <div className="aw-panel-head">
          <span className="aw-index">01</span>
          <div><h2 id="aw-step-one">Chọn phòng ban áp dụng</h2><p>Mỗi phòng ban có thể sử dụng một luồng phê duyệt riêng.</p></div>
        </div>
        <div className="aw-panel-content">
          <label className="aw-field" htmlFor="aw-department">
            <span className="aw-field-label">Phòng ban <span className="aw-required">*</span></span>
            <select id="aw-department" className="aw-select" disabled={loading || saving || !departments.length}
              value={departmentId} onChange={e => selectDepartment(e.target.value)}>
              <option value="">{loading ? 'Đang tải phòng ban...' : departments.length ? '— Chọn phòng ban —' : 'Chưa có phòng ban khả dụng'}</option>
              {departments.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
            </select>
          </label>
          {departmentIssue && <p className="aw-inline-warning" role="status">Không tải được phòng ban: {departmentIssue}</p>}
          {relevant && <div className="aw-info"><b>Phiên bản đang lưu: {relevant.version}</b><p>Lưu thay đổi sẽ tạo phiên bản mới; yêu cầu đang xử lý tiếp tục dùng quy trình cũ.</p></div>}
        </div>
      </section>

      <section className="aw-panel" aria-labelledby="aw-step-two">
        <div className="aw-panel-head aw-panel-head-row">
          <span className="aw-index">02</span>
          <div className="aw-panel-head-copy"><h2 id="aw-step-two">Thiết lập dải lương và người duyệt</h2><p>Mỗi mức lương sẽ đi qua các cấp phê duyệt theo đúng thứ tự.</p></div>
          <button type="button" className="aw-button aw-button-outline aw-add-range" onClick={addRange} disabled={saving}>+ Thêm dải lương</button>
        </div>
        <div className="aw-ranges">
          {ranges.map((band, index) => (
            <div className="aw-range" key={band.id}>
              <div className="aw-range-header">
                <div className="aw-range-title"><span className="aw-range-num">{String(index + 1).padStart(2, '0')}</span>
                  <div><h3>Dải lương {index + 1}</h3><p>{band.minSalary !== '' ? `${displayMoney(band.minSalary)} VNĐ` : 'Chưa nhập'} → {band.maxSalary !== '' ? `${displayMoney(band.maxSalary)} VNĐ` : 'Không giới hạn'}</p></div>
                </div>
                <button className="aw-button aw-button-remove" type="button" disabled={ranges.length === 1 || saving}
                  onClick={() => { setRanges(old => old.filter(r => r.id !== band.id)); setError(''); }} aria-label={`Xóa dải lương ${index + 1}`}>
                  Xóa dải
                </button>
              </div>
              <div className="aw-range-content">
                <div className="aw-money-grid">
                  <MoneyInput id={`aw-min-${band.id}`} label="Mức lương từ" value={band.minSalary}
                    onChange={v => updateRange(band.id, 'minSalary', v)} placeholder="Ví dụ: 0" />
                  <MoneyInput id={`aw-max-${band.id}`} label="Mức lương đến" value={band.maxSalary}
                    onChange={v => updateRange(band.id, 'maxSalary', v)} placeholder="Không giới hạn"
                    hint="Để trống nếu đây là dải lương cao nhất" />
                </div>
                <div className="aw-divider" />
                <div className="aw-approver-heading"><h4>Chuỗi phê duyệt</h4><span>{band.approverIds.length}/3 cấp</span></div>
                <div className="aw-approver-list">
                  {band.approverIds.map((id, level) => (
                    <div className="aw-approver-row" key={`${band.id}-${level}`}>
                      <div className="aw-step-indicator"><span>{level + 1}</span>{level + 1 < band.approverIds.length && <i />}</div>
                      <label className="aw-field" htmlFor={`aw-person-${band.id}-${level}`}>
                        <span className="aw-field-label">Người phê duyệt cấp {level + 1}</span>
                        <select id={`aw-person-${band.id}-${level}`} className="aw-select" value={id}
                          disabled={loading || saving || !approvers.length} onChange={e => updateApprover(band.id, level, e.target.value)}>
                          <option value="">{approvers.length ? '— Chọn người phê duyệt —' : 'Chưa có người duyệt khả dụng'}</option>
                          {approvers.map(person => <option key={person.id} value={person.id}>{person.fullName} · {person.email}</option>)}
                        </select>
                      </label>
                      <button type="button" className="aw-button aw-level-remove" disabled={band.approverIds.length === 1 || saving}
                        onClick={() => { setRanges(old => old.map(r => r.id === band.id ? { ...r, approverIds: r.approverIds.filter((_, i) => i !== level) } : r)); setError(''); }}
                        aria-label={`Xóa cấp duyệt ${level + 1} của dải ${index + 1}`} title="Xóa cấp duyệt">×</button>
                    </div>
                  ))}
                </div>
                {band.approverIds.length < 3 && <button type="button" className="aw-button aw-button-addstep" disabled={saving}
                  onClick={() => { setRanges(old => old.map(r => r.id === band.id ? { ...r, approverIds: [...r.approverIds, ''] } : r)); setError(''); }}>
                  + Thêm cấp phê duyệt
                </button>}
              </div>
            </div>
          ))}
          {approverIssue && <div className="aw-inline-warning" role="status"><b>Chưa tải được người phê duyệt.</b> {approverIssue}<p>API danh sách người duyệt phải được Backend cấp đúng quyền; không nên cấp quyền xem toàn bộ người dùng chỉ để mở trang này.</p></div>}
          {!approverIssue && !loading && approvers.length === 0 && <div className="aw-inline-warning">Chưa có tài khoản người phê duyệt khả dụng. Hãy kiểm tra dữ liệu vai trò APPROVER.</div>}
        </div>
      </section>

      <section className="aw-panel" aria-labelledby="aw-step-three">
        <div className="aw-panel-head"><span className="aw-index">03</span>
          <div><h2 id="aw-step-three">Xem trước luồng phê duyệt</h2><p>Nhập một mức lương để kiểm tra yêu cầu sẽ đi qua những ai.</p></div>
        </div>
        <div className="aw-panel-content">
          <div className="aw-preview-grid">
            <MoneyInput id="aw-test-salary" label="Lương đề xuất" value={previewSalary} onChange={setPreviewSalary} placeholder="Ví dụ: 15.000.000" />
            <div className="aw-preview-result" aria-live="polite">
              {previewSalary === '' ? <div className="aw-placeholder">Nhập số tiền ở bên trái để xem trước các cấp phê duyệt.</div>
                : preview ? <><div className="aw-preview-caption">Dải lương phù hợp · {preview.approverIds.length} cấp</div>
                  <div className="aw-preview-chain">{preview.approverIds.map((id, i) => <span key={`${i}-${id}`} className="aw-preview-person">
                    <span className="aw-preview-bubble">{i + 1}</span>
                    <span>{approvers.find(a => a.id === id)?.fullName || 'Chưa chọn người duyệt'}</span>
                  </span>)}</div>
                </> : <p className="aw-preview-unmatched">Chưa có dải lương phù hợp. Cần chỉnh cấu hình trước khi lưu.</p>}
            </div>
          </div>
        </div>
      </section>

      <footer className="aw-footer">
        <div><b>Lưu thành phiên bản mới</b><p>Cấu hình cũ và các yêu cầu đang phê duyệt được giữ nguyên.</p></div>
        <button type="button" className="aw-button aw-button-primary" disabled={loading || saving || Boolean(workflowIssue)} onClick={() => void save()}>
          {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
        </button>
      </footer>
    </div>
  );
}
