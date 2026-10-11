import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCopy, FileText, Info, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { atsApi, fromError } from './api';
import type { Requisition } from './api';
import './copy-requisition.css';

function formatSalary(value: number | null | undefined) {
  return value == null ? 'Chưa xác định' : `${new Intl.NumberFormat('vi-VN').format(value)} VNĐ`;
}
function statusName(value: string) {
  const labels: Record<string, string> = {
    DRAFT: 'Nháp', PENDING_APPROVAL: 'Chờ phê duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối',
  };
  return labels[value] || value;
}
function localDateToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function normalizeText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

type CreatedDraft = { id: string; status: string };

export default function CopyRequisition() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [source, setSource] = useState<Requisition | null>(null);
  const [created, setCreated] = useState<CreatedDraft | null>(null);

  useEffect(() => {
    let active = true;
    atsApi<Requisition[]>('/api/requisitions')
      .then(data => { if (active) setItems(Array.isArray(data) ? data : []); })
      .catch(e => { if (active) setError(fromError(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = normalizeText(search.trim());
    return items.filter(item => {
      const haystack = normalizeText(`${item.title || ''} ${item.department?.name || ''} ${item.id}`);
      return !term || haystack.includes(term);
    });
  }, [items, search]);

  async function choose(item: Requisition) {
    if (busy || loadingDetail) return;
    setError(''); setCreated(null); setSource(null); setLoadingDetail(true);
    try {
      const detail = await atsApi<Requisition>(`/api/requisitions/${encodeURIComponent(item.id)}`);
      if (!detail?.id) throw new Error('Không tìm thấy dữ liệu chi tiết của yêu cầu đã chọn.');
      setSource(detail);
    } catch (e) {
      setError(fromError(e));
    } finally {
      setLoadingDetail(false);
    }
  }

  async function copyToDraft() {
    if (!source || busy || loadingDetail || created) return;
    setError(''); setBusy(true);
    try {
      // S3-05: chỉ gửi nội dung tuyển dụng; KHÔNG gửi id/status/owner/approver/approval history.
      const target = source.targetDate?.slice(0, 10);
      const payload = {
        title: source.title || undefined,
        departmentId: source.departmentId,
        ...(source.jobTitleId ? { jobTitleId: source.jobTitleId } : {}),
        headcount: source.headcount && source.headcount > 0 ? source.headcount : 1,
        reason: source.reason === 'REPLACEMENT' ? 'REPLACEMENT' : 'NEW',
        description: source.description || '',
        requirements: source.requirements || '',
        ...(source.proposedSalaryMin != null ? { proposedSalaryMin: source.proposedSalaryMin } : {}),
        ...(source.proposedSalaryMax != null ? { proposedSalaryMax: source.proposedSalaryMax } : {}),
        ...(source.salaryExplanation ? { salaryExplanation: source.salaryExplanation } : {}),
        ...(target && target >= localDateToday() ? { targetDate: target } : {}),
        isDraft: true,
      };
      const result = await atsApi<CreatedDraft>('/api/requisitions', 'POST', payload);
      if (!result?.id || !result.status) throw new Error('Backend chưa trả đủ mã và trạng thái bản sao. Hãy kiểm tra dữ liệu trước khi thử lại.');
      // Luôn lưu kết quả trước: nếu BE trả trạng thái sai, không cho tạo trùng khi nhấn lại.
      setCreated(result);
      if (result.status !== 'DRAFT') {
        setError(`Backend đã tạo yêu cầu ${result.id} với trạng thái ${result.status}, không phải Nháp. Cần BE kiểm tra, không tạo lại để tránh trùng.`);
      }
    } catch (e) {
      setError(fromError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="s305-page">
      <div className="s305-breadcrumb">
        <button type="button" onClick={() => navigate('/recruitment-requests/create')}>Yêu cầu tuyển dụng</button>
        <span>/</span><strong>Sao chép yêu cầu</strong>
      </div>

      <header className="s305-heading">
        <div className="s305-heading-icon"><ClipboardCopy size={25} aria-hidden="true" /></div>
        <div className="s305-heading-content">
          <span className="s305-eyebrow">QUẢN LÝ TUYỂN DỤNG · TẠO TỪ YÊU CẦU CŨ</span>
          <h1>Sao chép yêu cầu tuyển dụng</h1>
          <p>Chọn một yêu cầu đã có, kiểm tra nội dung và tạo bản nháp mới mà không cần nhập lại mô tả công việc.</p>
        </div>
        <button className="s305-back" type="button" onClick={() => navigate('/recruitment-requests/create')}><ArrowLeft size={17} /> Quay lại</button>
      </header>

      <div className="s305-note" role="note">
        <ShieldCheck size={22} aria-hidden="true" />
        <p><strong>Bản sao luôn ở trạng thái Nháp.</strong> Hệ thống chỉ sao chép thông tin tuyển dụng, không sao chép người duyệt, trạng thái hay lịch sử phê duyệt. Bạn có thể chỉnh sửa bản nháp trước khi gửi duyệt.</p>
      </div>
      {error && <div className="s305-error" role="alert"><Info size={19} aria-hidden="true" /><span>{error}</span></div>}
      {created?.status === 'DRAFT' && (
        <div className="s305-success" role="status">
          <CheckCircle2 size={24} aria-hidden="true" />
          <div><strong>Đã tạo bản sao thành công ở trạng thái Nháp.</strong>
            <p>Mã yêu cầu mới: <code>{created.id}</code>. Lịch sử phê duyệt không được kế thừa từ yêu cầu gốc.</p>
            <p>Để chỉnh sửa, mở trang tạo yêu cầu rồi chọn <strong>“Xem bản nháp đã lưu”</strong>.</p>
          </div>
          <button type="button" onClick={() => navigate('/recruitment-requests/create')}>Đến bản nháp <ArrowRight size={16} /></button>
        </div>
      )}

      <div className="s305-steps" aria-label="Các bước sao chép">
        <div><b>01</b><span>Chọn yêu cầu nguồn</span></div>
        <div><b>02</b><span>Kiểm tra nội dung</span></div>
        <div><b>03</b><span>Tạo bản nháp mới</span></div>
      </div>

      <div className="s305-grid">
        <section className="s305-panel" aria-labelledby="s305-source-label">
          <div className="s305-panel-head"><div><span className="s305-section-label">BƯỚC 01</span><h2 id="s305-source-label">Chọn yêu cầu đã có</h2><p>Chỉ hiển thị yêu cầu bạn được quyền xem.</p></div><span className="s305-count">{items.length} yêu cầu</span></div>
          <label className="s305-search"><Search size={19} aria-hidden="true" />
            <span className="s305-sr-only">Tìm yêu cầu tuyển dụng</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên vị trí, phòng ban, mã yêu cầu..." disabled={loading || busy} />
          </label>
          <div className="s305-list" aria-busy={loading || loadingDetail}>
            {loading && <div className="s305-empty"><Loader2 size={24} className="s305-spin" /><p>Đang tải danh sách yêu cầu...</p></div>}
            {!loading && filtered.length === 0 && <div className="s305-empty"><FileText size={24} /><p>{items.length ? 'Không tìm thấy yêu cầu phù hợp.' : 'Chưa có yêu cầu tuyển dụng nào trong phạm vi truy cập.'}</p></div>}
            {!loading && filtered.map(item => (
              <button type="button" key={item.id} disabled={loadingDetail || busy} onClick={() => void choose(item)} className={`s305-source ${source?.id === item.id ? 's305-source--selected' : ''}`} aria-pressed={source?.id === item.id}>
                <span className="s305-source-top"><strong>{item.title || 'Yêu cầu tuyển dụng'}</strong><span className="s305-status">{statusName(item.status)}</span></span>
                <span className="s305-source-meta"><Users size={14} /> {item.department?.name || 'Chưa rõ phòng ban'} · {item.headcount || 1} vị trí</span>
                <span className="s305-source-foot">Mã: {item.id.slice(0, 12)}… <ArrowRight size={15} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        </section>

        <section className="s305-panel s305-detail" aria-labelledby="s305-preview-label">
          <div className="s305-panel-head"><div><span className="s305-section-label">BƯỚC 02</span><h2 id="s305-preview-label">Kiểm tra nội dung bản sao</h2><p>Thông tin lấy trực tiếp từ yêu cầu đã chọn.</p></div></div>
          {loadingDetail ? <div className="s305-preview-empty"><Loader2 className="s305-spin" size={30} /><p>Đang tải nội dung yêu cầu...</p></div>
          : !source ? <div className="s305-preview-empty"><ClipboardCopy size={37} /><h3>Chưa chọn yêu cầu nguồn</h3><p>Nhấn vào một yêu cầu ở danh sách bên trái để xem nội dung sẽ được sao chép.</p></div>
          : <>
              <div className="s305-preview-title"><strong>{source.title || 'Yêu cầu tuyển dụng'}</strong><span>Trạng thái gốc: {statusName(source.status)}</span></div>
              <div className="s305-facts"><div><span>Phòng ban</span><strong>{source.department?.name || 'Theo yêu cầu gốc'}</strong></div><div><span>Số lượng</span><strong>{source.headcount || 1} người</strong></div><div><span>Lương từ</span><strong>{formatSalary(source.proposedSalaryMin)}</strong></div><div><span>Lương đến</span><strong>{formatSalary(source.proposedSalaryMax)}</strong></div></div>
              <div className="s305-document"><h3><FileText size={17} /> Mô tả công việc</h3><p>{source.description?.trim() || 'Yêu cầu gốc chưa có mô tả công việc.'}</p></div>
              <div className="s305-document"><h3><Users size={17} /> Yêu cầu ứng viên</h3><p>{source.requirements?.trim() || 'Yêu cầu gốc chưa có tiêu chí ứng viên.'}</p></div>
              {source.targetDate && source.targetDate.slice(0, 10) < localDateToday() && <p className="s305-date-note"><Info size={16} /> Ngày cần nhân sự ở yêu cầu gốc đã qua nên bản sao sẽ để trống ngày này.</p>}
              <div className="s305-action-footer"><div><strong>BƯỚC 03 · XÁC NHẬN</strong><p>Bản nháp mới không kế thừa lịch sử duyệt.</p></div>
                <button type="button" className="s305-primary" onClick={() => void copyToDraft()} disabled={busy || Boolean(created)}>
                  {busy ? <><Loader2 size={17} className="s305-spin" /> Đang tạo...</> : <><ClipboardCopy size={17} /> Tạo bản nháp <ArrowRight size={16} /></>}
                </button>
              </div>
            </>}
        </section>
      </div>
    </div>
  );
}
