import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, BriefcaseBusiness, Clock3, Mail, MessageSquareText, Phone, Send, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { filterPublicJobs, type PublicJobListing } from "./publicJobFilters";
import "./employee-referral.css";

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type ApiResult<T> = { success: boolean; data?: T; error?: { message?: string } };
type Referral = { id: string; candidateName: string; jobTitle: string; referralDate: string; statusLabel: string; generalStatus: string; source: string };
type ReferralList = { items: Referral[]; pagination: { page: number; totalPages: number; total: number } };
type Form = { jobId: string; fullName: string; email: string; phone: string; note: string };
const EMPTY_FORM: Form = { jobId: "", fullName: "", email: "", phone: "", note: "" };

function sessionUser(): { fullName: string; email: string } | null {
  try {
    const raw = sessionStorage.getItem("atsUser");
    return raw ? JSON.parse(raw) as { fullName: string; email: string } : null;
  } catch { return null; }
}

function accessToken() { return sessionStorage.getItem("accessToken") || ""; }

export default function EmployeeReferral() {
  const user = sessionUser();
  const [jobs, setJobs] = useState<PublicJobListing[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [listError, setListError] = useState("");
  const [listBusy, setListBusy] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [jobsResponse, referralsResponse] = await Promise.all([
          fetch(`${API_URL}/api/public/jobs`, { signal: controller.signal }),
          fetch(`${API_URL}/api/referrals/my-referrals?limit=50`, {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${accessToken()}` },
          }),
        ]);
        const jobResult = await jobsResponse.json() as ApiResult<PublicJobListing[] | { items: PublicJobListing[] }>;
        const rawJobs = Array.isArray(jobResult.data) ? jobResult.data : jobResult.data?.items;
        if (!jobsResponse.ok || !jobResult.success || !Array.isArray(rawJobs)) {
          setJobsError(jobResult.error?.message || "Không thể tải vị trí đang tuyển.");
        } else {
          setJobs(filterPublicJobs(rawJobs, { keyword: "", department: "ALL", location: "ALL", workMode: "ALL" }));
        }
        const referralResult = await referralsResponse.json() as ApiResult<ReferralList>;
        if (!referralsResponse.ok || !referralResult.success || !Array.isArray(referralResult.data?.items)) {
          setListError(referralResult.error?.message || "Không thể tải danh sách giới thiệu.");
        } else {
          setReferrals(referralResult.data.items);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setJobsError(error instanceof Error ? error.message : "Không kết nối được máy chủ.");
        setListError("Không thể tải danh sách giới thiệu.");
      } finally {
        if (!controller.signal.aborted) { setLoadingJobs(false); setListBusy(false); }
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  const selectedJob = useMemo(() => jobs.find(j => j.id === form.jobId), [jobs, form.jobId]);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const canSubmit = Boolean(form.jobId) && form.fullName.trim().length >= 2 && validEmail && form.note.trim().length > 0;
  function edit(key: keyof Form, value: string) {
    setForm(old => ({ ...old, [key]: value }));
    setSubmitError(""); setSubmitSuccess("");
  }
  async function submitReferral(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true); setSubmitError(""); setSubmitSuccess("");
    try {
      const response = await fetch(`${API_URL}/api/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken()}` },
        body: JSON.stringify({ jobId: form.jobId, fullName: form.fullName.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), notes: form.note.trim() }),
      });
      const result = await response.json() as ApiResult<{ id: string; statusLabel: string }>;
      if (!response.ok || !result.success) {
        setSubmitError(result.error?.message || "Không thể gửi giới thiệu.");
        return;
      }
      setSubmitSuccess("Đã gửi giới thiệu ứng viên thành công.");
      setForm(EMPTY_FORM);
      const followup = await fetch(`${API_URL}/api/referrals/my-referrals?limit=50`, { headers: { Authorization: `Bearer ${accessToken()}` } });
      const body = await followup.json() as ApiResult<ReferralList>;
      if (followup.ok && body.success && Array.isArray(body.data?.items)) {
        setReferrals(body.data.items);
        setListError("");
      } else {
        setListError("Đã lưu thành công nhưng chưa tải lại được danh sách theo dõi.");
      }
    } catch {
      setSubmitError("Không kết nối được Backend. Vui lòng kiểm tra máy chủ và thử lại.");
    } finally { setSubmitting(false); }
  }

  return (
    <section className="s407-page">
      <header className="s407-header">
        <span className="s407-eyebrow">GIỚI THIỆU ỨNG VIÊN</span>
        <h1>Giới thiệu người quen</h1>
        <p>Giới thiệu ứng viên cho vị trí đang tuyển và theo dõi trạng thái tổng quát.</p>
      </header>
      {jobsError && <div className="s407-alert s407-alert--error" role="alert"><AlertCircle size={18}/>{jobsError}</div>}
      {submitError && <div className="s407-alert s407-alert--error" role="alert"><AlertCircle size={18}/>{submitError}</div>}
      {submitSuccess && <div className="s407-alert" role="status">{submitSuccess}</div>}
      <div className="s407-layout">
        <form className="s407-card s407-form-card" onSubmit={event => { void submitReferral(event); }}>
          <div className="s407-card-title"><div className="s407-icon"><UserPlus size={21}/></div><div><h2>Thông tin giới thiệu</h2><p>Nhập thông tin ứng viên và vị trí phù hợp.</p></div></div>
          <div className="s407-form">
            <label><span><BriefcaseBusiness size={16}/>Vị trí đang tuyển *</span>
              <select value={form.jobId} disabled={loadingJobs} onChange={e=>edit("jobId",e.target.value)}>
                <option value="">{loadingJobs ? "Đang tải vị trí..." : "Chọn vị trí tuyển dụng"}</option>
                {jobs.map(j=><option key={j.id} value={j.id}>{j.title}{j.department?.name ? ` — ${j.department.name}` : ""}</option>)}
              </select>
            </label>
            {selectedJob && <div className="s407-job-preview"><strong>{selectedJob.title}</strong><span>{selectedJob.department?.name || "Chưa có phòng ban"} · {selectedJob.location || "Chưa có địa điểm"}</span></div>}
            <label><span><UserRound size={16}/>Họ tên ứng viên *</span><input value={form.fullName} onChange={e=>edit("fullName",e.target.value)} placeholder="Nguyễn Văn A" required minLength={2}/></label>
            <label><span><Mail size={16}/>Email *</span><input type="email" value={form.email} onChange={e=>edit("email",e.target.value)} required placeholder="candidate@example.com"/></label>
            <label><span><Phone size={16}/>Số điện thoại</span><input value={form.phone} onChange={e=>edit("phone",e.target.value)} placeholder="09xxxxxxxx"/></label>
            <label><span><MessageSquareText size={16}/>Ghi chú giới thiệu *</span><textarea rows={5} value={form.note} onChange={e=>edit("note",e.target.value)} required maxLength={2000} placeholder="Từng làm việc cùng ứng viên, kỹ năng phù hợp..."/></label>
          </div>
          <button type="submit" className="s407-submit" disabled={!canSubmit || loadingJobs || submitting}><Send size={18}/>{submitting ? "Đang gửi..." : "Gửi giới thiệu"}</button>
        </form>
        <aside className="s407-side">
          <section className="s407-card"><div className="s407-card-title"><div className="s407-icon"><ShieldCheck size={21}/></div><div><h2>Nguồn hồ sơ</h2><p>Được lưu cùng giới thiệu.</p></div></div>
            <dl className="s407-source"><div><dt>Nguồn</dt><dd>Giới thiệu nội bộ</dd></div><div><dt>Người giới thiệu</dt><dd>{user?.fullName || "Không xác định"}</dd></div>{user?.email && <div><dt>Email người giới thiệu</dt><dd>{user.email}</dd></div>}</dl>
          </section>
          <section className="s407-card"><div className="s407-card-title"><div className="s407-icon"><Clock3 size={21}/></div><div><h2>Theo dõi giới thiệu</h2><p>Chỉ hiển thị trạng thái tổng quát.</p></div></div>
            {listError && <p role="alert">{listError}</p>}
            {listBusy ? <p>Đang tải hồ sơ...</p> : referrals.length === 0 ? <div className="s407-tracking-empty"><Clock3 size={30}/><strong>Chưa có giới thiệu</strong><span>Hồ sơ bạn giới thiệu sẽ hiển thị tại đây.</span></div> : (
              <div className="s407-referral-list">{referrals.map(ref=><div className="s407-referral-item" key={ref.id}><strong>{ref.candidateName}</strong><p>{ref.jobTitle}</p><span>Trạng thái: {ref.statusLabel}</span></div>)}</div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
