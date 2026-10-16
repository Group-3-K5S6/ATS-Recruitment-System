import { Building2, CalendarDays, Clock3, MapPin, Wallet, Laptop2 } from 'lucide-react';

export type PublishedPresentation = {
  job: {
    id: string;
    title: string;
    description: string;
    location: string;
    workMode?: string | null;
    applicationDeadline?: string | null;
    department?: { name?: string } | null;
    requisition?: { requirements?: string | null } | null;
    salary?: { showSalary: boolean; displayText: string } | null;
  };
  companyProfile?: { companyName?: string; tagline?: string | null } | null;
};

function dateText(value?: string | null) {
  if (!value) return 'Đang cập nhật';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Đang cập nhật' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(d);
}
function workModeText(value?: string | null) {
  return value === 'REMOTE' ? 'Làm việc từ xa' : value === 'HYBRID' ? 'Làm việc kết hợp'
    : value === 'ONSITE' ? 'Tại văn phòng' : 'Đang cập nhật';
}

// Exactly the same presentation in HR's preview and the anonymous public detail page.
export default function JobPublicContent({ data }: { data: PublishedPresentation }) {
  const { job, companyProfile } = data;
  return <article className="s310-public-preview s310-job-detail-layout">
    <div className="s310-public-heading">
      <span className="s310-public-heading-eyebrow">CHI TIẾT CƠ HỘI NGHỀ NGHIỆP</span>
      <h2>{job.title}</h2>
      <p>{companyProfile?.companyName || 'ATS Recruitment'}</p>
      <div className="s310-detail-tags"><span><MapPin size={16}/>{job.location || 'Địa điểm đang cập nhật'}</span><span><Laptop2 size={16}/>{workModeText(job.workMode)}</span><span><Building2 size={16}/>{job.department?.name || 'Phòng ban đang cập nhật'}</span></div>
    </div>
    <div className="s310-detail-grid">
      <div className="s310-detail-body">
        {companyProfile?.tagline && <div className="s310-detail-company-note">{companyProfile.tagline}</div>}
        <section className="s310-public-section"><h3>Mô tả công việc</h3><div className="s310-preserve-lines">{job.description || 'Nội dung đang được cập nhật.'}</div></section>
        {job.requisition?.requirements && <section className="s310-public-section"><h3>Yêu cầu ứng viên</h3><div className="s310-preserve-lines">{job.requisition.requirements}</div></section>}
      </div>
      <aside className="s310-detail-aside" aria-label="Thông tin vị trí">
        <div className="s310-detail-aside-header"><span className="s310-live-dot"/> Tổng quan vị trí</div>
        <dl>
          <div><dt><Building2 size={17}/> Phòng ban</dt><dd>{job.department?.name || 'Đang cập nhật'}</dd></div>
          <div><dt><MapPin size={17}/> Địa điểm</dt><dd>{job.location || 'Đang cập nhật'}</dd></div>
          <div><dt><Laptop2 size={17}/> Hình thức</dt><dd>{workModeText(job.workMode)}</dd></div>
          <div><dt><CalendarDays size={17}/> Hạn nhận hồ sơ</dt><dd>{dateText(job.applicationDeadline)}</dd></div>
          {job.salary?.showSalary && <div><dt><Wallet size={17}/> Mức lương</dt><dd>{job.salary.displayText}</dd></div>}
        </dl>
        <p className="s310-detail-smallnote"><Clock3 size={15}/> Thông tin được hiển thị theo tin tuyển dụng đã công bố.</p>
      </aside>
    </div>
  </article>;
}
