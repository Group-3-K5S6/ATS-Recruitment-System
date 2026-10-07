import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, CircleHelp, Edit2, Plus, Search, Tag, Users, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import "./RecruitmentCatalogPage.css";

type Category = "SOURCE" | "REJECTION_REASON";
type CatalogItem = { id: string; category: Category; name: string; description: string | null; isActive: boolean; sortOrder: number };
type Props = { role: Role; userName: string; onLogout: () => Promise<void> };
const API = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

export default function RecruitmentCatalogPage({ role, userName, onLogout }: Props) {
  const navigate = useNavigate();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState<Category>("SOURCE");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [modal, setModal] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const request = async (path: string, init: RequestInit = {}) => {
    const token = sessionStorage.getItem("accessToken");
    const response = await fetch(`${API}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers } });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.error?.message || "Không thể kết nối với máy chủ.");
    return result.data;
  };

  const loadItems = async () => {
    setLoading(true); setError("");
    try { setItems(await request("/api/recruitment-catalog")); }
    catch (e) { setError(e instanceof Error ? e.message : "Không tải được danh mục."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadItems(); }, []);

  const visible = useMemo(() => items.filter(item => item.category === category && (item.name.toLowerCase().includes(query.toLowerCase()) || (item.description || "").toLowerCase().includes(query.toLowerCase()))), [items, category, query]);
  const activeCount = items.filter(item => item.category === category && item.isActive).length;

  const openCreate = () => { setEditing(null); setName(""); setDescription(""); setModal(true); };
  const openEdit = (item: CatalogItem) => { setEditing(item); setName(item.name); setDescription(item.description || ""); setModal(true); };
  const saveItem = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const saved = await request(editing ? `/api/recruitment-catalog/${editing.id}` : "/api/recruitment-catalog", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(editing ? { name: name.trim(), description: description.trim() || null } : { category, name: name.trim(), description: description.trim() || null }),
      });
      setItems(current => editing ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]);
      setModal(false); setNotice(editing ? "Đã cập nhật danh mục." : "Đã thêm danh mục mới.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không lưu được danh mục."); }
    finally { setSaving(false); }
  };
  const toggleActive = async (item: CatalogItem) => {
    setError(""); setNotice("");
    try {
      const saved = item.isActive
        ? await request(`/api/recruitment-catalog/${item.id}`, { method: "DELETE" })
        : await request(`/api/recruitment-catalog/${item.id}`, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
      setItems(current => current.map(row => row.id === saved.id ? saved : row));
      setNotice(saved.isActive ? "Đã kích hoạt lại danh mục." : "Đã ngừng sử dụng danh mục.");
    } catch (e) { setError(e instanceof Error ? e.message : "Không cập nhật được danh mục."); }
  };

  const handleMenu = (label: string) => {
    if (label === "Tổng quan") navigate("/dashboard");
    if (label === "Phòng ban & tổ chức") navigate("/departments");
    if (label === "Chức danh & dải lương") navigate("/job-titles");
    if (label === "Trang giới thiệu công ty") navigate("/company-profile");
    if (label === "Hồ sơ cá nhân") navigate("/profile");
  };

  return <div className="dashboard-layout">
    <Sidebar role={role} userName={userName} onLogout={onLogout} selectedMenu="Danh mục tuyển dụng" onMenuSelect={handleMenu} />
    <main className="dashboard-content catalog-page">
      <div className="catalog-breadcrumb"><button onClick={() => navigate("/dashboard")}><ArrowLeft size={15}/> Tổng quan</button><span>/</span><span>Cấu hình tuyển dụng</span></div>
      <header className="catalog-header"><div><div className="catalog-eyebrow"><span className="catalog-eyebrow-icon"><Tag size={15}/></span> QUẢN TRỊ TUYỂN DỤNG</div><h1>Danh mục dùng chung</h1><p>Chuẩn hóa cách ghi nhận nguồn ứng viên và lý do loại trên toàn đội ngũ.</p></div><button className="catalog-primary" onClick={openCreate}><Plus size={17}/> Thêm danh mục</button></header>
      <div className="catalog-stats"><div className="catalog-stat-icon"><Tag size={18}/></div><div><strong>{activeCount}</strong><span> mục đang sử dụng</span></div><div className="catalog-stat-divider"/><div><strong>{items.filter(i => i.category === category).length}</strong><span> tổng mục</span></div><div className="catalog-stat-note"><CircleHelp size={15}/> Dữ liệu này giúp báo cáo tuyển dụng nhất quán.</div></div>
      <div className="catalog-tabs" role="tablist"><button className={category === "SOURCE" ? "selected" : ""} onClick={() => setCategory("SOURCE")}><Users size={17}/> Nguồn ứng viên <span>{items.filter(i => i.category === "SOURCE").length}</span></button><button className={category === "REJECTION_REASON" ? "selected" : ""} onClick={() => setCategory("REJECTION_REASON")}><X size={17}/> Lý do loại <span>{items.filter(i => i.category === "REJECTION_REASON").length}</span></button></div>
      <section className="catalog-card"><div className="catalog-card-heading"><div><h2>{category === "SOURCE" ? "Nguồn ứng viên" : "Lý do loại ứng viên"}</h2><p>{category === "SOURCE" ? "Thống nhất kênh ứng viên biết đến cơ hội tuyển dụng." : "Dùng chung các lý do để phản hồi và phân tích hồ sơ bị loại."}</p></div><label className="catalog-search"><Search size={16}/><input placeholder="Tìm trong danh mục..." value={query} onChange={e => setQuery(e.target.value)}/></label></div>
        {notice && <div className="catalog-notice"><Check size={16}/>{notice}<button onClick={() => setNotice("")}><X size={14}/></button></div>}
        {error && <div className="catalog-error">{error}<button onClick={() => setError("")}>Đóng</button></div>}
        <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>TÊN DANH MỤC</th><th>MÔ TẢ</th><th>TRẠNG THÁI</th><th className="catalog-actions-head">THAO TÁC</th></tr></thead><tbody>
          {loading ? <tr><td colSpan={4} className="catalog-empty">Đang tải danh mục...</td></tr> : visible.length === 0 ? <tr><td colSpan={4} className="catalog-empty">{query ? "Không tìm thấy mục phù hợp." : "Chưa có danh mục nào. Thêm mục đầu tiên để bắt đầu."}</td></tr> : visible.map((item, index) => <tr key={item.id}><td><div className="catalog-name"><span className="catalog-row-index">{String(index + 1).padStart(2, "0")}</span><strong>{item.name}</strong></div></td><td className="catalog-description">{item.description || <span className="catalog-muted">Chưa có mô tả</span>}</td><td><span className={`catalog-status ${item.isActive ? "on" : "off"}`}><i/>{item.isActive ? "Đang dùng" : "Đã tắt"}</span></td><td><div className="catalog-row-actions"><button title="Chỉnh sửa" onClick={() => openEdit(item)}><Edit2 size={15}/></button><button className={item.isActive ? "catalog-deactivate" : "catalog-reactivate"} onClick={() => void toggleActive(item)}>{item.isActive ? "Ngừng dùng" : "Kích hoạt"}<ChevronDown size={13}/></button></div></td></tr>)}
        </tbody></table></div><footer className="catalog-table-footer">Hiển thị <strong>{visible.length}</strong> / {items.filter(item => item.category === category).length} mục</footer>
      </section>
      <div className="catalog-tip"><span>i</span><p><strong>Lưu ý:</strong> Danh mục đã sử dụng vẫn được giữ trong lịch sử. Khi ngừng dùng, recruiter sẽ không thể chọn mục đó cho hồ sơ mới.</p></div>
    </main>
    {modal && <div className="catalog-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}><form className="catalog-modal" onSubmit={saveItem}><div className="catalog-modal-head"><div><span>{editing ? "CẬP NHẬT" : "TẠO MỚI"}</span><h2>{editing ? "Sửa danh mục" : category === "SOURCE" ? "Thêm nguồn ứng viên" : "Thêm lý do loại"}</h2></div><button type="button" onClick={() => setModal(false)}><X size={18}/></button></div><label>Tên danh mục <b>*</b><input autoFocus maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder={category === "SOURCE" ? "Ví dụ: Giới thiệu nội bộ" : "Ví dụ: Thiếu kinh nghiệm phù hợp"} required minLength={2}/></label><label>Mô tả <span>Không bắt buộc</span><textarea maxLength={300} rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Mô tả ngắn để recruiter hiểu khi nào nên chọn mục này"/></label>{error && <div className="catalog-error">{error}</div>}<div className="catalog-modal-footer"><button type="button" className="catalog-secondary" onClick={() => setModal(false)}>Hủy</button><button className="catalog-primary" disabled={saving}><Check size={16}/>{saving ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Thêm danh mục"}</button></div></form></div>}
  </div>;
}
