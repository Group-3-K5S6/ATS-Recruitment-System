import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Eye, MapPin, Search, Send, Users, X } from "lucide-react";
import { atsApi } from "./api";
import "./job-posting-publish.css";

type JobStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "REJECTED" | "CLOSED";
type Job = {
  id: string;
  title: string;
  status: JobStatus | string;
  description: string;
  location: string;
  workMode?: string | null;
  applicationDeadline?: string | null;
  showSalary?: boolean;
  publishedAt?: string | null;
  publishedBy?: { fullName: string } | null;
  department?: { name?: string } | null;
  recruiter?: { fullName?: string } | null;
};
type Preview = {
  job: Job & {
    salary?: { showSalary: boolean; displayText: string };
    requisition?: { requirements?: string | null } | null;
  };
  companyProfile?: { companyName?: string; tagline?: string | null; logoData?: string | null; location?: string | null } | null;
};

const statusText: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt – chờ xuất bản",
  REJECTED: "Đã từ chối",
};
function formatDate(v?: string | null) {
  if (!v) return "Chưa thiết lập";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "Chưa thiết lập" : new Intl.DateTimeFormat("vi-VN").format(d);
}
function workModeLabel(v?: string | null) {
  return v === "REMOTE" ? "Làm việc từ xa" : v === "HYBRID" ? "Kết hợp" : v === "ONSITE" ? "Tại văn phòng" : "Chưa xác định";
}

export default function JobPostingPublish() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError("");
      setJobs(await atsApi<Job[]>("/api/jobs"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách tin tuyển dụng.");
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadJobs(); }, []);

  const actionable = useMemo(() => jobs.filter(j => ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED"].includes(j.status)), [jobs]);
  const shown = useMemo(() => {
    const k = search.trim().toLowerCase();
    return actionable.filter(j => !k || [j.title, j.id, j.department?.name, j.location].some(t => (t || "").toLowerCase().includes(k)));
  }, [actionable, search]);

  const showPreview = async (job: Job) => {
    try {
      setPreviewLoading(true);
      setError("");
      // Always fetch backend preview: includes brand profile and salary visibility.
      setPreview(await atsApi<Preview>(`/api/jobs/${encodeURIComponent(job.id)}/preview`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được dữ liệu xem trước.");
    } finally { setPreviewLoading(false); }
  };

  type Action = "submit-for-approval" | "approve" | "reject" | "publish";
  const perform = async (job: Job, action: Action) => {
    let body: unknown = undefined;
    if (action === "publish") {
      if (job.status !== "APPROVED") return setError("Tin chưa được duyệt, không thể xuất bản.");
      if (!window.confirm(`Xuất bản công khai tin “${job.title}” đã được duyệt?`)) return;
    } else if (action === "approve") {
      if (job.status !== "PENDING_APPROVAL") return setError("Chỉ duyệt tin ở trạng thái Chờ duyệt.");
      const notes = window.prompt(`Ý kiến duyệt tin “${job.title}” (không bắt buộc):`, "");
      if (notes === null) return;
      body = { notes };
    } else if (action === "reject") {
      if (job.status !== "PENDING_APPROVAL") return setError("Chỉ từ chối tin đang chờ duyệt.");
      const reason = window.prompt(`Nhập lý do từ chối tin “${job.title}” (tối thiểu 3 ký tự):`, "");
      if (reason === null) return;
      if (reason.trim().length < 3) return setError("Lý do từ chối phải có ít nhất 3 ký tự.");
      body = { reason: reason.trim() };
    } else {
      if (!["DRAFT", "REJECTED"].includes(job.status)) return setError("Tin không ở trạng thái có thể gửi duyệt.");
      if (!window.confirm(`Gửi tin “${job.title}” để HR Manager duyệt?`)) return;
    }
    try {
      setBusyId(job.id);
      setError("");
      setNotice("");
      const updated = await atsApi<Job>(`/api/jobs/${encodeURIComponent(job.id)}/${action}`, "POST", body);
      const expected: Record<Action, string> = { "submit-for-approval": "PENDING_APPROVAL", approve: "APPROVED", reject: "REJECTED", publish: "PUBLISHED" };
      if (updated.status !== expected[action]) throw new Error("Backend trả trạng thái không đúng sau thao tác.");
      setJobs(current => current.map(j => j.id === updated.id ? updated : j));
      setPreview(null);
      setNotice(action === "publish" ? `Đã xuất bản tin “${job.title}”.` : action === "approve" ? `Đã duyệt tin “${job.title}”.` : action === "reject" ? `Đã từ chối tin “${job.title}”.` : `Đã gửi duyệt tin “${job.title}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Thao tác không thành công.");
    } finally { setBusyId(null); }
  };

  const actionButtons = (job: Job) => <div className="s310-actions">
    <button type="button" className="s310-preview-button" disabled={previewLoading || busyId !== null} onClick={() => void showPreview(job)}><Eye size={16} /> Xem trước</button>
    {(["DRAFT", "REJECTED"].includes(job.status)) && <button type="button" className="s310-publish-button" disabled={busyId !== null} onClick={() => void perform(job, "submit-for-approval")}><Send size={16} /> Gửi duyệt</button>}
    {job.status === "PENDING_APPROVAL" && <>
      <button type="button" className="s310-publish-button" disabled={busyId !== null} onClick={() => void perform(job, "approve")}>Duyệt</button>
      <button type="button" className="s310-preview-button" disabled={busyId !== null} onClick={() => void perform(job, "reject")}>Từ chối</button>
    </>}
    {job.status === "APPROVED" && <button type="button" className="s310-publish-button" disabled={busyId !== null} onClick={() => void perform(job, "publish")}><Send size={16} /> Xuất bản</button>}
  </div>;

  return <section className="s310-page">
    <header className="s310-header"><div><h1>Duyệt và xuất bản tin tuyển dụng</h1><p>Gửi duyệt → Duyệt → Xem trước → Xuất bản. Tin chưa duyệt không hiển thị công khai.</p></div>
      <div className="s310-summary"><Send size={20}/><div><strong>{actionable.length}</strong><span>Tin cần xử lý</span></div></div>
    </header>
    {error && <div className="s310-alert s310-alert-error" role="alert"><AlertCircle size={18}/>{error}</div>}
    {notice && <div className="s310-alert s310-alert-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
    <div className="s310-toolbar"><div className="s310-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm theo tiêu đề, phòng ban, địa điểm hoặc mã tin..."/></div><span>{shown.length} tin cần xử lý</span></div>
    <div className="s310-table-wrapper"><table className="s310-table"><thead><tr><th>Tin tuyển dụng</th><th>Phòng ban</th><th>Địa điểm</th><th>Hình thức</th><th>Recruiter</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody>{loading ? <tr><td colSpan={7}>Đang tải danh sách...</td></tr> : shown.length === 0 ? <tr><td colSpan={7}><div className="s310-empty">Không có tin cần xử lý.</div></td></tr> : shown.map(job=><tr key={job.id}>
        <td><div className="s310-job-name"><strong>{job.title}</strong><span>{job.id}</span></div></td><td>{job.department?.name || "Chưa xác định"}</td><td>{job.location}</td><td>{workModeLabel(job.workMode)}</td><td>{job.recruiter?.fullName || "Chưa phân công"}</td><td><span className="s310-status">{statusText[job.status] || job.status}</span></td><td>{actionButtons(job)}</td>
      </tr>)}</tbody></table></div>
    {preview && <div className="s310-modal-backdrop"><div className="s310-modal" role="dialog" aria-modal="true" aria-label="Xem trước tin tuyển dụng">
      <div className="s310-modal-toolbar"><div><strong>Xem trước tin tuyển dụng</strong><span>Dữ liệu lấy từ API xem trước, gồm thông tin công ty và hiển thị lương.</span></div><button type="button" className="s310-close" onClick={()=>setPreview(null)} aria-label="Đóng"><X size={20}/></button></div>
      <div className="s310-public-preview"><div className="s310-public-heading"><div className="s310-company-logo">{preview.companyProfile?.companyName?.charAt(0) || "A"}</div><div><span>{preview.companyProfile?.companyName || "Thông tin tuyển dụng"}</span><h2>{preview.job.title}</h2><p>{preview.job.department?.name || "Chưa xác định"}</p></div></div>
      {preview.companyProfile?.tagline && <p>{preview.companyProfile.tagline}</p>}
      <div className="s310-meta"><span><MapPin size={16}/>{preview.job.location}</span><span><Users size={16}/>{workModeLabel(preview.job.workMode)}</span></div>
      <div className="s310-public-section"><h3>Mô tả công việc</h3><p className="s310-preserve-lines">{preview.job.description}</p></div>
      {preview.job.requisition?.requirements && <div className="s310-public-section"><h3>Yêu cầu ứng viên</h3><p className="s310-preserve-lines">{preview.job.requisition.requirements}</p></div>}
      <div className="s310-public-section"><h3>Thông tin tuyển dụng</h3><dl><div><dt>Phòng ban</dt><dd>{preview.job.department?.name || "Chưa xác định"}</dd></div><div><dt>Địa điểm</dt><dd>{preview.job.location}</dd></div><div><dt>Hình thức</dt><dd>{workModeLabel(preview.job.workMode)}</dd></div><div><dt>Hạn nhận hồ sơ</dt><dd>{formatDate(preview.job.applicationDeadline)}</dd></div>{preview.job.salary?.showSalary && <div><dt>Mức lương</dt><dd>{preview.job.salary.displayText}</dd></div>}</dl></div>
      <div className="s310-public-footer"><span>Đây là bản xem trước nội bộ; chỉ tin đã duyệt và xuất bản mới được công khai.</span>{preview.job.status === "APPROVED" && <button type="button" className="s310-publish-button" disabled={busyId !== null} onClick={()=>void perform(preview.job,"publish")}>Xuất bản</button>}</div>
      </div></div></div>}
  </section>;
}
