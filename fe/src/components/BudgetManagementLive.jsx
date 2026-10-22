import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Building2, CheckCircle2, ClipboardList, RefreshCw, Save, ShieldAlert, Users, Wallet } from 'lucide-react';
import { atsApi, fromError } from '../features/sprint3/api';
import './budget-management.css';

const currentYear = new Date().getFullYear();
const yearOptions = [currentYear - 1, currentYear, currentYear + 1];
const currency = new Intl.NumberFormat('vi-VN');

function userCanManage() {
  try {
    const stored = JSON.parse(sessionStorage.getItem('atsUser') || 'null');
    return Array.isArray(stored?.roles) && stored.roles.some((role) => ['ADMIN', 'HR_MANAGER'].includes(role));
  } catch {
    return false;
  }
}

function statusOf(row) {
  if (row.allocatedHeadcount == null) return { kind: 'neutral', text: 'Chưa khai báo' };
  if (row.remainingHeadcount < 0) return { kind: 'danger', text: 'Vượt chỉ tiêu' };
  if (row.remainingHeadcount === 0) return { kind: 'warning', text: 'Hết chỉ tiêu' };
  return { kind: 'success', text: 'Còn chỉ tiêu' };
}

function Metric({ icon: Icon, label, value, detail, tone = 'blue' }) {
  return <div className="bm-metric">
    <span className={`bm-metric-icon bm-tone-${tone}`}><Icon size={20} aria-hidden="true" /></span>
    <div><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>
  </div>;
}

export default function BudgetManagement() {
  const navigate = useNavigate();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [headcountInput, setHeadcountInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [salaryRows, setSalaryRows] = useState([]);
  const [salaryLoading, setSalaryLoading] = useState(true);
  const [salaryError, setSalaryError] = useState('');
  const [salarySelectedId, setSalarySelectedId] = useState('');
  const [salaryInput, setSalaryInput] = useState('');
  const [salarySaving, setSalarySaving] = useState(false);
  const [salaryFeedback, setSalaryFeedback] = useState(null);
  const canManage = userCanManage();

  const reload = useCallback(async (signal) => {
    setLoading(true);
    setLoadError('');
    try {
      const result = await atsApi(`/api/recruitment-budget/headcount?year=${year}`);
      if (signal?.aborted) return;
      if (!Array.isArray(result)) throw new Error('API chỉ tiêu trả về dữ liệu không đúng định dạng.');
      setRows(result);
    } catch (error) {
      if (!signal?.aborted) { setRows([]); setLoadError(fromError(error)); }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const reloadSalary = useCallback(async (signal) => {
    setSalaryLoading(true);
    setSalaryError('');
    try {
      const data = await atsApi(`/api/recruitment-budget/salary?year=${year}`);
      if (signal?.aborted) return;
      if (!Array.isArray(data)) throw new Error('API ngân sách lương trả về dữ liệu không hợp lệ.');
      setSalaryRows(data);
    } catch (error) {
      if (!signal?.aborted) { setSalaryRows([]); setSalaryError(fromError(error)); }
    } finally {
      if (!signal?.aborted) setSalaryLoading(false);
    }
  }, [year]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadSalary(controller.signal);
    return () => controller.abort();
  }, [reloadSalary]);

  const salaryByDepartment = useMemo(() => new Map(
    salaryRows.map((item) => [item.department.id, item.salaryBudget])
  ), [salaryRows]);

  function onSalaryDepartmentChange(id) {
    setSalarySelectedId(id);
    const previous = salaryByDepartment.get(id);
    setSalaryInput(previous == null ? '' : String(previous));
    setSalaryFeedback(null);
  }

  function formatMoney(value) {
    if (value == null) return '—';
    try { return `${BigInt(value).toLocaleString('vi-VN')} ₫`; }
    catch { return 'Dữ liệu không hợp lệ'; }
  }

  async function saveSalary(event) {
    event.preventDefault();
    setSalaryFeedback(null);
    if (!canManage) { setSalaryFeedback({ type: 'error', message: 'Tài khoản không có quyền sửa ngân sách lương.' }); return; }
    const value = salaryInput.trim();
    if (!salarySelectedId || !/^(0|[1-9]\d*)$/.test(value)) {
      setSalaryFeedback({ type: 'error', message: 'Chọn phòng ban và nhập ngân sách VND là số nguyên không âm.' });
      return;
    }
    if (BigInt(value) > 9223372036854775807n) {
      setSalaryFeedback({ type: 'error', message: 'Ngân sách vượt giới hạn lưu trữ.' });
      return;
    }
    setSalarySaving(true);
    try {
      await atsApi(`/api/recruitment-budget/salary/${encodeURIComponent(salarySelectedId)}`, 'PUT', { year, salaryBudget: value });
      await reloadSalary();
      setSalaryFeedback({ type: 'success', message: `Đã lưu ngân sách lương năm ${year} vào Backend. Hãy tải lại trang để kiểm tra.` });
    } catch (error) {
      setSalaryFeedback({ type: 'error', message: fromError(error) });
    } finally {
      setSalarySaving(false);
    }
  }

  const selected = rows.find((row) => row.department.id === selectedId);
  const view = useMemo(() => rows.filter((row) =>
    `${row.department.name} ${row.department.code || ''}`.toLocaleLowerCase('vi-VN').includes(filter.trim().toLocaleLowerCase('vi-VN'))
  ), [rows, filter]);
  const configured = rows.filter((row) => row.allocatedHeadcount !== null);
  const totalApproved = rows.reduce((sum, row) => sum + (Number(row.approvedHeadcount) || 0), 0);
  const totalRemaining = configured.reduce((sum, row) => sum + Math.max(0, Number(row.remainingHeadcount) || 0), 0);
  const issueCount = rows.filter((row) => row.allocatedHeadcount === null || row.remainingHeadcount <= 0).length;

  function choose(row) {
    setSelectedId(row.department.id);
    setHeadcountInput(row.allocatedHeadcount == null ? '' : String(row.allocatedHeadcount));
    setFeedback(null);
    document.getElementById('bm-config-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function save(event) {
    event.preventDefault();
    setFeedback(null);
    if (!canManage) { setFeedback({ type: 'error', message: 'Tài khoản này không có quyền khai báo chỉ tiêu.' }); return; }
    const headcount = Number(headcountInput);
    if (!selectedId || headcountInput.trim() === '' || !Number.isSafeInteger(headcount) || headcount < 0) {
      setFeedback({ type: 'error', message: 'Chọn phòng ban và nhập chỉ tiêu là số nguyên không âm.' });
      return;
    }
    if (selected && headcount < selected.approvedHeadcount) {
      setFeedback({ type: 'error', message: `Chỉ tiêu không được thấp hơn ${selected.approvedHeadcount} vị trí đã phê duyệt.` });
      return;
    }
    setSaving(true);
    try {
      await atsApi(`/api/recruitment-budget/headcount/${encodeURIComponent(selectedId)}`, 'PUT', { year, headcount });
      setFeedback({ type: 'success', message: 'Đã lưu chỉ tiêu headcount trên hệ thống. Dữ liệu được tải lại từ Backend.' });
      await reload();
    } catch (error) {
      setFeedback({ type: 'error', message: fromError(error) });
    } finally {
      setSaving(false);
    }
  }

  return <section className="bm-page">
    <header className="bm-header">
      <div>
        <h1>Ngân sách & chỉ tiêu nhân sự</h1>
        <p>Quản lý định mức headcount theo phòng ban và theo năm. Số liệu được đọc trực tiếp từ hệ thống.</p>
      </div>
      <div className="bm-header-actions">
        <label htmlFor="bm-year">Năm kế hoạch</label>
        <select id="bm-year" value={year} onChange={(e) => { setYear(Number(e.target.value)); setSelectedId(''); setHeadcountInput(''); setFeedback(null); setSalarySelectedId(''); setSalaryInput(''); setSalaryFeedback(null); }}>
          {yearOptions.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button type="button" className="bm-btn bm-btn-outline" title="Tải lại dữ liệu" disabled={loading || saving} onClick={() => { setFeedback(null); setSalaryFeedback(null); void reload(); void reloadSalary(); }}><RefreshCw size={16}/><span>Làm mới</span></button>
      </div>
    </header>

    <div className="bm-stats" aria-label="Thống kê headcount">
      <Metric icon={Building2} label="Phòng ban đang hoạt động" value={loading ? '—' : rows.length} detail="Theo dữ liệu tổ chức"/>
      <Metric icon={ClipboardList} label="Đã khai báo chỉ tiêu" value={loading ? '—' : `${configured.length}/${rows.length}`} detail={`Trong năm ${year}`} tone="purple"/>
      <Metric icon={Users} label="Headcount đã duyệt" value={loading ? '—' : currency.format(totalApproved)} detail="Tổng yêu cầu đã duyệt trong năm" tone="teal"/>
      <Metric icon={ShieldAlert} label="Chỉ tiêu còn lại" value={loading ? '—' : currency.format(totalRemaining)} detail={`${issueCount} phòng ban cần lưu ý`} tone="orange"/>
    </div>

    {loadError && <div className="bm-alert bm-alert-error" role="alert"><AlertCircle size={18}/><div><strong>Không thể tải dữ liệu</strong><p>{loadError}</p></div><button type="button" onClick={() => void reload()}>Thử lại</button></div>}
    {feedback && <div className={`bm-alert bm-alert-${feedback.type}`} role="status">{feedback.type === 'success' ? <CheckCircle2 size={18}/> : <AlertCircle size={18}/>}<p>{feedback.message}</p></div>}

    <div className="bm-grid">
      <article className="bm-panel" id="bm-config-form">
        <div className="bm-panel-head"><span className="bm-panel-icon"><ClipboardList size={20}/></span><div><h2>Khai báo chỉ tiêu headcount</h2><p>Thiết lập hoặc cập nhật chỉ tiêu của phòng ban cho năm {year}.</p></div></div>
        <form className="bm-form" onSubmit={(event) => void save(event)}>
          <label>Phòng ban <span className="bm-required">*</span>
            <select value={selectedId} disabled={loading || !canManage || saving} onChange={(event) => { const id = event.target.value; const row = rows.find((item) => item.department.id === id); setSelectedId(id); setHeadcountInput(row?.allocatedHeadcount == null ? '' : String(row.allocatedHeadcount)); setFeedback(null); }}>
              <option value="">Chọn phòng ban</option>
              {rows.map((row) => <option key={row.department.id} value={row.department.id}>{row.department.name}</option>)}
            </select>
          </label>
          <label>Chỉ tiêu tuyển dụng (người) <span className="bm-required">*</span>
            <input type="number" min="0" step="1" placeholder="Nhập số lượng được phê duyệt" value={headcountInput} disabled={!selectedId || !canManage || saving} onChange={(event) => setHeadcountInput(event.target.value)}/>
          </label>
          {selected && <div className="bm-context"><span>Headcount đã duyệt trong {year}</span><strong>{selected.approvedHeadcount} người</strong><small>Không thể đặt chỉ tiêu thấp hơn số đã duyệt.</small></div>}
          {!canManage && <p className="bm-hint">Chỉ Trưởng phòng Nhân sự hoặc Admin được sửa chỉ tiêu.</p>}
          <div className="bm-form-actions"><button className="bm-btn bm-btn-primary" type="submit" disabled={!canManage || !selectedId || loading || saving}><Save size={16}/>{saving ? 'Đang lưu…' : 'Lưu chỉ tiêu'}</button></div>
        </form>
      </article>
      <aside className="bm-panel bm-side-panel">
        <div className="bm-panel-head"><span className="bm-panel-icon bm-icon-warning"><Wallet size={20}/></span><div><h2>Ngân sách lương theo năm</h2><p>Phân bổ quỹ lương đã được phê duyệt cho từng phòng ban.</p></div></div>
        <form className="bm-salary-form" onSubmit={(event) => void saveSalary(event)}>
          <label>Phòng ban <span className="bm-required">*</span>
            <select value={salarySelectedId} disabled={loading || salaryLoading || salarySaving || !canManage} onChange={(event) => onSalaryDepartmentChange(event.target.value)}>
              <option value="">Chọn phòng ban</option>
              {rows.map((row) => <option key={row.department.id} value={row.department.id}>{row.department.name}</option>)}
            </select>
          </label>
          <label>Ngân sách lương năm {year} (VND) <span className="bm-required">*</span>
            <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="Ví dụ: 300000000" value={salaryInput} disabled={!salarySelectedId || salaryLoading || salarySaving || !canManage} onChange={(event) => setSalaryInput(event.target.value.replace(/[^0-9]/g, ''))}/>
          </label>
          {salarySelectedId && <div className="bm-salary-existing">Đã lưu trên hệ thống: <strong>{formatMoney(salaryByDepartment.get(salarySelectedId))}</strong></div>}
          <p className="bm-salary-note">Ngân sách là tổng quỹ lương được phê duyệt trong năm, không phải chi phí tuyển dụng thực chi. Nhập số nguyên VND; 0 nghĩa là không phân bổ.</p>
          {salaryError && <div className="bm-salary-message bm-salary-message-error" role="alert">Lỗi tải ngân sách: {salaryError} <button type="button" onClick={() => void reloadSalary()}>Thử lại</button></div>}
          {salaryFeedback && <div className={`bm-salary-message bm-salary-message-${salaryFeedback.type}`} role="status">{salaryFeedback.message}</div>}
          {!canManage && <p className="bm-hint">Chỉ Trưởng phòng Nhân sự hoặc Admin được chỉnh sửa.</p>}
          <div className="bm-salary-actions"><button className="bm-btn bm-btn-primary" type="submit" disabled={!canManage || !salarySelectedId || salaryInput === '' || salarySaving || salaryLoading || loading || !!salaryError}><Save size={16}/>{salarySaving ? 'Đang lưu…' : 'Lưu ngân sách lương'}</button></div>
        </form>
      </aside>
    </div>

    <article className="bm-panel bm-list-panel">
      <div className="bm-list-head"><div><h2>Chỉ tiêu theo phòng ban</h2><p>Dữ liệu năm {year}; “Đã duyệt” là số lượng trong yêu cầu tuyển dụng đã được phê duyệt, không phải tổng nhân viên hiện có.</p></div><label className="bm-search-label"><span>Tìm phòng ban</span><input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Tên hoặc mã phòng ban"/></label></div>
      <div className="bm-table-scroll"><table className="bm-table"><thead><tr><th>Phòng ban</th><th className="bm-num">Chỉ tiêu</th><th className="bm-num">Đã duyệt</th><th className="bm-num">Ngân sách lương/năm</th><th className="bm-num">Còn lại</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={7} className="bm-empty">Đang tải dữ liệu từ Backend…</td></tr> : view.length === 0 ? <tr><td colSpan={7} className="bm-empty">{loadError ? 'Không có dữ liệu do lỗi kết nối.' : rows.length === 0 ? 'Chưa có phòng ban đang hoạt động.' : 'Không tìm thấy phòng ban phù hợp.'}</td></tr> : view.map((row) => {
          const status = statusOf(row);
          return <tr key={row.department.id}><td><strong>{row.department.name}</strong><small>{row.department.code || 'Phòng ban'}</small></td>
            <td className="bm-num">{row.allocatedHeadcount === null ? '—' : currency.format(row.allocatedHeadcount)}</td>
            <td className="bm-num">{currency.format(row.approvedHeadcount)}</td>
            <td className="bm-num bm-money">{salaryLoading ? '…' : salaryError ? 'Không tải được' : formatMoney(salaryByDepartment.get(row.department.id))}</td>
            <td className={`bm-num bm-remaining-${status.kind}`}>{row.remainingHeadcount === null ? '—' : currency.format(row.remainingHeadcount)}</td>
            <td><span className={`bm-tag bm-tag-${status.kind}`}>{status.text}</span></td>
            <td><div className="bm-row-actions">{canManage && <button type="button" className="bm-link-btn" onClick={() => choose(row)}>Thiết lập</button>}<button type="button" className="bm-link-btn" onClick={() => navigate('/recruitment-requests/create')}>Tạo yêu cầu <ArrowRight size={13}/></button></div></td>
          </tr>;
        })}
      </tbody></table></div>
      <footer className="bm-table-foot"><span>Không sử dụng dữ liệu mô phỏng. Số liệu cập nhật khi tải lại.</span>{!loading && <span>{view.length} phòng ban</span>}</footer>
    </article>
  </section>;
}
