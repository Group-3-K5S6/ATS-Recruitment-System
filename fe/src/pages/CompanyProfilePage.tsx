import { useEffect, useState } from "react";
import { ArrowLeft, Building2, Check, Eye, Globe2, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import "./CompanyProfilePage.css";

type Profile = {
  companyName: string;
  tagline: string;
  introduction: string;
  culture: string;
  benefits: string;
  website: string;
  contactEmail: string;
  location: string;
  isPublished: boolean;
};
type Props = { role: Role; userName: string; onLogout: () => Promise<void> };
const API = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";
const emptyProfile: Profile = {
  companyName: "", tagline: "", introduction: "", culture: "", benefits: "",
  website: "", contactEmail: "", location: "", isPublished: false,
};

export default function CompanyProfilePage({ role, userName, onLogout }: Props) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = async (method = "GET", body?: Profile) => {
    const response = await fetch(`${API}/api/company-profile`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("accessToken") || ""}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error?.message || "Không thể kết nối với máy chủ.");
    return result.data as Profile;
  };

  useEffect(() => {
    let active = true;
    void request().then(data => { if (active) setProfile({ ...emptyProfile, ...data }); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Không tải được cấu hình."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const update = (key: keyof Profile, value: string | boolean) => setProfile(current => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try { setProfile(await request("PUT", profile)); setNotice("Đã lưu cấu hình trang giới thiệu công ty."); }
    catch (e) { setError(e instanceof Error ? e.message : "Không lưu được cấu hình."); }
    finally { setSaving(false); }
  };
  const handleMenu = (label: string) => {
    if (label === "Tổng quan") navigate("/dashboard");
    if (label === "Danh mục tuyển dụng") navigate("/recruitment-catalog");
    if (label === "Trang giới thiệu công ty") navigate("/company-profile");
    if (label === "Phòng ban & tổ chức") navigate("/departments");
    if (label === "Chức danh & dải lương") navigate("/job-titles");
    if (label === "Hồ sơ cá nhân") navigate("/profile");
  };

  return <div className="dashboard-layout">
    <Sidebar role={role} userName={userName} onLogout={onLogout} selectedMenu="Trang giới thiệu công ty" onMenuSelect={handleMenu}/>
    <main className="dashboard-content company-profile-page">
      <div className="company-profile-breadcrumb"><button type="button" onClick={() => navigate("/dashboard")}><ArrowLeft size={15}/> Tổng quan</button><span>/</span><span>Cấu hình tuyển dụng</span><span>/</span><span>Trang giới thiệu công ty</span></div>
      <header className="company-profile-header"><div><div className="company-profile-eyebrow"><Building2 size={15}/> QUẢN TRỊ TUYỂN DỤNG</div><h1>Trang giới thiệu công ty</h1><p>Quản lý nội dung giới thiệu và thông tin hiển thị với ứng viên.</p></div><div className="company-profile-header-actions"><button type="button" className="company-profile-preview-button" onClick={() => setPreview(v => !v)}><Eye size={16}/>{preview ? "Đóng xem trước" : "Xem trước"}</button></div></header>
      {error && <div className="company-profile-alert error" role="alert">{error}</div>}
      {notice && <div className="company-profile-alert success"><Check size={16}/>{notice}</div>}
      {loading ? <div className="company-profile-loading">Đang tải cấu hình...</div> : <div className={`company-profile-layout ${preview ? "with-preview" : ""}`}>
        <form className="company-profile-form" onSubmit={save}>
          <section className="company-profile-card"><div className="company-profile-section-heading"><span className="company-profile-section-icon"><Building2 size={17}/></span><div><h2>Thông tin doanh nghiệp</h2><p>Thông tin cơ bản xuất hiện trên trang tuyển dụng.</p></div></div>
            <div className="company-profile-fields"><label className="wide">Tên công ty <b>*</b><input required minLength={2} maxLength={120} value={profile.companyName} onChange={e => update("companyName", e.target.value)} placeholder="Ví dụ: Công ty Cổ phần ABC"/></label>
              <label className="wide">Thông điệp giới thiệu<input maxLength={180} value={profile.tagline} onChange={e => update("tagline", e.target.value)} placeholder="Một câu ngắn về môi trường và cơ hội tại công ty"/><small>{profile.tagline.length}/180 ký tự</small></label>
              <label className="wide">Giới thiệu công ty<textarea rows={6} maxLength={5000} value={profile.introduction} onChange={e => update("introduction", e.target.value)} placeholder="Chia sẻ về công ty, lĩnh vực hoạt động và hành trình phát triển..."/><small>{profile.introduction.length}/5000 ký tự</small></label>
            </div>
          </section>
          <section className="company-profile-card"><div className="company-profile-section-heading"><span className="company-profile-section-icon"><Globe2 size={17}/></span><div><h2>Trải nghiệm nhân viên</h2><p>Giúp ứng viên hiểu văn hóa và quyền lợi khi gia nhập.</p></div></div>
            <div className="company-profile-fields"><label>Văn hóa công ty<textarea rows={4} maxLength={3000} value={profile.culture} onChange={e => update("culture", e.target.value)} placeholder="Mô tả cách đội ngũ làm việc và các giá trị chung..."/></label><label>Phúc lợi<textarea rows={4} maxLength={3000} value={profile.benefits} onChange={e => update("benefits", e.target.value)} placeholder="Các quyền lợi và hỗ trợ dành cho nhân viên..."/></label></div>
          </section>
          <section className="company-profile-card"><div className="company-profile-section-heading"><span className="company-profile-section-icon"><Globe2 size={17}/></span><div><h2>Liên hệ và xuất bản</h2><p>Thông tin để ứng viên tìm hiểu thêm hoặc liên hệ tuyển dụng.</p></div></div>
            <div className="company-profile-fields"><label>Website<input type="url" maxLength={250} value={profile.website} onChange={e => update("website", e.target.value)} placeholder="https://congty.vn"/></label><label>Email tuyển dụng<input type="email" maxLength={250} value={profile.contactEmail} onChange={e => update("contactEmail", e.target.value)} placeholder="careers@congty.vn"/></label><label className="wide">Địa điểm<input maxLength={250} value={profile.location} onChange={e => update("location", e.target.value)} placeholder="Thành phố, quốc gia"/></label></div>
            <label className="company-profile-publish"><input type="checkbox" checked={profile.isPublished} onChange={e => update("isPublished", e.target.checked)}/><span><strong>Đăng trang giới thiệu</strong><small>Bật để cho phép nội dung hiển thị trên trang tuyển dụng công khai.</small></span><i className={profile.isPublished ? "on" : ""}/></label>
          </section>
          <div className="company-profile-form-footer"><span>Các thay đổi chỉ có hiệu lực sau khi lưu.</span><button type="submit" className="catalog-primary" disabled={saving}><Save size={16}/>{saving ? "Đang lưu..." : "Lưu cấu hình"}</button></div>
        </form>
        {preview && <aside className="company-profile-preview"><div className="company-profile-preview-top"><span>TRANG TUYỂN DỤNG</span><span className={profile.isPublished ? "published" : "draft"}>{profile.isPublished ? "Đang đăng" : "Bản nháp"}</span></div><div className="company-profile-preview-hero"><div className="company-profile-preview-logo">{profile.companyName ? profile.companyName.charAt(0).toUpperCase() : "C"}</div><p>VỀ CHÚNG TÔI</p><h2>{profile.companyName || "Tên công ty"}</h2><strong>{profile.tagline || "Thông điệp giới thiệu sẽ xuất hiện tại đây"}</strong></div><div className="company-profile-preview-body"><h3>Câu chuyện của chúng tôi</h3><p>{profile.introduction || "Nội dung giới thiệu công ty sẽ hiển thị tại đây."}</p>{profile.culture && <><h3>Văn hóa</h3><p>{profile.culture}</p></>}{profile.benefits && <><h3>Quyền lợi</h3><p>{profile.benefits}</p></>}<div className="company-profile-preview-contact">{profile.location && <span>{profile.location}</span>}{profile.contactEmail && <span>{profile.contactEmail}</span>}{profile.website && <span>{profile.website}</span>}</div></div></aside>}
      </div>}
    </main>
  </div>;
}
