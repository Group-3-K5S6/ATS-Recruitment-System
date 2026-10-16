import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Building2, ChevronRight, Globe2, MapPin, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import JobPublicContent, { type PublishedPresentation } from './JobPublicContent';
import './job-posting-publish.css';
import './public-careers.css';

const API = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';
type Listing = {
  id: string;
  title: string;
  location: string;
  workMode?: string | null;
  department?: { name?: string } | null;
};
type Envelope<T> = { success: boolean; data?: T; error?: { message?: string } };

async function publicGet<T>(path: string, signal: AbortSignal): Promise<T> {
  // Public endpoints never receive the staff session or Authorization header.
  const res = await fetch(`${API}${path}`, { signal });
  const envelope = await res.json() as Envelope<T>;
  if (!res.ok || !envelope.success || envelope.data === undefined) {
    throw new Error(envelope.error?.message || 'Không tải được dữ liệu tuyển dụng.');
  }
  return envelope.data;
}

function modeLabel(value?: string | null) {
  return value === 'HYBRID' ? 'Linh hoạt / kết hợp'
    : value === 'REMOTE' ? 'Làm việc từ xa'
    : value === 'ONSITE' ? 'Tại văn phòng' : 'Hình thức cập nhật sau';
}

// Phiên ATS dùng sessionStorage: liên kết cổng công khai cần mở CÙNG tab.
// Nếu mở tab mới hoặc ẩn danh, phải đăng nhập lại trước khi trở về trang nội bộ.
function staffDestination(): { path: string; label: string } {
  try {
    const token = sessionStorage.getItem('accessToken');
    const userRaw = sessionStorage.getItem('atsUser');
    const user = userRaw ? JSON.parse(userRaw) as { id?: string; roles?: string[] } : null;
    if (token && user?.id && Array.isArray(user.roles)) {
      if (user.roles.includes('HR_MANAGER')) {
        return { path: '/job-postings/publish', label: 'Quay lại quản lý duyệt & xuất bản' };
      }
      if (user.roles.includes('RECRUITER')) {
        return { path: '/job-postings/draft', label: 'Quay lại soạn tin tuyển dụng' };
      }
      return { path: '/', label: 'Về trang quản lý nội bộ' };
    }
  } catch { /* Phiên không hợp lệ: sử dụng màn hình đăng nhập */ }
  return { path: '/login', label: 'Đăng nhập nhân sự' };
}

export default function PublicCareers() {
  const { id } = useParams<{ id: string }>();
  const staffNav = staffDestination();
  const [jobs, setJobs] = useState<Listing[]>([]);
  const [detail, setDetail] = useState<PublishedPresentation | null>(null);
  const [search, setSearch] = useState('');
  const [workMode, setWorkMode] = useState('ALL');
  const [department, setDepartment] = useState('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    const timer = window.setTimeout(() => {
      if (abort.signal.aborted) return;
      setLoading(true);
      setError('');
      setDetail(null);
      const promise = id
        ? publicGet<PublishedPresentation>(`/api/public/jobs/${encodeURIComponent(id)}`, abort.signal).then(setDetail)
        : publicGet<Listing[]>('/api/public/jobs', abort.signal).then(setJobs);
      promise.catch(e => { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Đã có lỗi xảy ra.'); })
        .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
    };
  }, [id, retry]);

  const departments = useMemo(() => [...new Set(jobs.map(j => j.department?.name).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'vi')), [jobs]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('vi');
    return jobs.filter(job => {
      const matchesTerm = !term || [job.title, job.department?.name, job.location].some(v => (v || '').toLocaleLowerCase('vi').includes(term));
      return matchesTerm && (workMode === 'ALL' || job.workMode === workMode)
        && (department === 'ALL' || job.department?.name === department);
    });
  }, [jobs, search, workMode, department]);

  const hasFilters = search !== '' || workMode !== 'ALL' || department !== 'ALL';
  const resetFilters = () => { setSearch(''); setWorkMode('ALL'); setDepartment('ALL'); };

  return <div className="s310-careers-page">
    <a className="s310-skip-link" href="#careers-main">Bỏ qua điều hướng</a>
    <header className="s310-careers-header">
      <div className="s310-careers-header-inner">
        <Link to="/careers" className="s310-careers-brand" aria-label="ATS - Trang tuyển dụng">
          <span className="s310-brand-mark">A</span>
          <span className="s310-brand-words"><strong>ATS Careers</strong><small>Cơ hội nghề nghiệp</small></span>
        </Link>
        <nav aria-label="Điều hướng cổng tuyển dụng" className="s310-careers-topnav">
          <Link to="/careers" className="s310-topnav-active">Vị trí tuyển dụng</Link>
          <Link to={staffNav.path} className="s310-topnav-staff">{staffNav.label} <ArrowRight size={14} aria-hidden="true"/></Link>
        </nav>
      </div>
    </header>

    <main id="careers-main" className="s310-careers-main">
      {id ? <>
        <nav className="s310-careers-breadcrumb" aria-label="Đường dẫn">
          <Link to="/careers">Cơ hội nghề nghiệp</Link><ChevronRight size={15} aria-hidden="true"/><span>Chi tiết vị trí</span>
        </nav>
        {loading ? <div className="s310-careers-loading" role="status">Đang tải thông tin vị trí…</div>
          : error ? <section className="s310-careers-feedback" role="alert">
            <div className="s310-feedback-icon"><BriefcaseBusiness size={24}/></div>
            <h1>Không thể xem tin tuyển dụng này</h1>
            <p>Tin có thể đã đóng, hết hạn hoặc chưa được xuất bản. Bạn có thể quay lại để chọn vị trí đang mở.</p>
            <div className="s310-feedback-actions"><Link className="s310-careers-primary" to="/careers"><ArrowLeft size={16}/> Về danh sách vị trí</Link><button className="s310-careers-outline" type="button" onClick={() => setRetry(v => v + 1)}><RefreshCw size={16}/> Thử lại</button></div>
          </section>
          : detail ? <>
            <Link className="s310-careers-inlineback" to="/careers"><ArrowLeft size={16}/> Xem tất cả vị trí đang tuyển</Link>
            <div className="s310-careers-detail"><JobPublicContent data={detail}/></div>
            <div className="s310-careers-bottom"><div><strong>Muốn tìm vị trí khác?</strong><span>Khám phá các cơ hội đang được công khai.</span></div><Link to="/careers" className="s310-careers-outline">Xem danh sách <ArrowRight size={16}/></Link></div>
          </> : null}
      </> : <>
        <section className="s310-careers-hero">
          <div className="s310-careers-hero-copy">
            <span className="s310-careers-kicker"><span className="s310-live-dot"/> CƠ HỘI NGHỀ NGHIỆP</span>
            <h1>Cùng tạo nên những<br/><em>bước tiến mới.</em></h1>
            <p>Khám phá các vị trí đang tuyển dụng và tìm cơ hội phù hợp với kinh nghiệm, định hướng của bạn.</p>
            <a href="#careers-list" className="s310-careers-primary">Khám phá vị trí <ArrowRight size={17}/></a>
          </div>
          <div className="s310-careers-hero-art" aria-hidden="true"><div className="s310-art-ring s310-art-ring-one"/><div className="s310-art-ring s310-art-ring-two"/><div className="s310-art-symbol"><BriefcaseBusiness size={55} strokeWidth={1.5}/></div><div className="s310-art-pill"><span className="s310-live-dot"/> Cơ hội mới</div></div>
        </section>

        <section id="careers-list" className="s310-careers-positions" aria-labelledby="s310-positions-heading">
          <div className="s310-positions-heading"><div><span className="s310-section-eyebrow">TUYỂN DỤNG</span><h2 id="s310-positions-heading">Vị trí đang mở</h2><p>Chỉ các tin đã được duyệt và xuất bản mới xuất hiện tại đây.</p></div><span className="s310-positions-counter"><Globe2 size={16}/> {loading ? 'Đang tải' : `${jobs.length} vị trí công khai`}</span></div>
          <div className="s310-careers-filters">
            <label className="s310-careers-search"><Search size={18} aria-hidden="true"/><span className="s310-visually-hidden">Tìm theo vị trí, phòng ban hoặc địa điểm</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm vị trí, phòng ban hoặc địa điểm…"/></label>
            <label className="s310-careers-select"><SlidersHorizontal size={16}/><span className="s310-visually-hidden">Hình thức làm việc</span><select value={workMode} onChange={e=>setWorkMode(e.target.value)}><option value="ALL">Mọi hình thức</option><option value="ONSITE">Tại văn phòng</option><option value="HYBRID">Kết hợp</option><option value="REMOTE">Từ xa</option></select></label>
            <label className="s310-careers-select"><Building2 size={16}/><span className="s310-visually-hidden">Phòng ban</span><select value={department} onChange={e=>setDepartment(e.target.value)}><option value="ALL">Mọi phòng ban</option>{departments.map(name => <option value={name} key={name}>{name}</option>)}</select></label>
          </div>
          {loading ? <div className="s310-careers-loading" role="status">Đang tải danh sách vị trí…</div>
            : error ? <div className="s310-careers-feedback" role="alert"><h3>Không thể tải danh sách</h3><p>{error}</p><button className="s310-careers-outline" onClick={() => setRetry(v => v + 1)} type="button"><RefreshCw size={16}/> Thử lại</button></div>
            : filtered.length === 0 ? <div className="s310-careers-feedback"><div className="s310-feedback-icon"><Search size={22}/></div><h3>{hasFilters ? 'Chưa có vị trí phù hợp' : 'Hiện chưa có vị trí đang mở'}</h3><p>{hasFilters ? 'Hãy thử từ khóa hoặc bộ lọc khác.' : 'Các vị trí mới sẽ được cập nhật tại đây sau khi xuất bản.'}</p>{hasFilters && <button type="button" onClick={resetFilters} className="s310-careers-outline">Xóa bộ lọc</button>}</div>
            : <><div className="s310-careers-countline" aria-live="polite">Hiển thị <strong>{filtered.length}</strong> vị trí{hasFilters && <> · <button type="button" onClick={resetFilters}>Xóa bộ lọc</button></>}</div><div className="s310-careers-list">
              {filtered.map(job => <Link key={job.id} to={`/careers/${encodeURIComponent(job.id)}`} className="s310-careers-item">
                <span className="s310-careers-job-icon"><BriefcaseBusiness size={22}/></span>
                <span className="s310-careers-job-main"><strong>{job.title}</strong><span className="s310-careers-job-tags"><span><Building2 size={14}/>{job.department?.name || 'Phòng ban đang cập nhật'}</span><span><MapPin size={14}/>{job.location || 'Đang cập nhật'}</span><span className="s310-job-mode">{modeLabel(job.workMode)}</span></span></span>
                <span className="s310-careers-job-link">Xem chi tiết <ArrowRight size={17}/></span>
              </Link>)}
            </div></>}
        </section>
      </>}
    </main>
    <footer className="s310-careers-footer"><div><strong>ATS Careers</strong><span>Thông tin tuyển dụng được cập nhật theo trạng thái xuất bản chính thức.</span></div><span>© {new Date().getFullYear()} ATS</span></footer>
  </div>;
}
