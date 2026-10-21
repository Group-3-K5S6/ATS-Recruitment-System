import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Building,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Send,
  Share2,
  ExternalLink,
  Mail,
  ShieldCheck,
  Gift,
  FileText,
  X,
  Sparkles,
} from 'lucide-react';
import { getJobDetail, applyForJob } from '../services/jobApi';
import type { JobDetail, ApplyPayload } from '../services/jobApi';
import './JobDetailPage.css';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Không giới hạn';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function getWorkModeLabel(mode?: string): string {
  switch (mode) {
    case 'ONSITE':
      return 'Làm việc tại văn phòng';
    case 'HYBRID':
      return 'Làm việc kết hợp (Hybrid)';
    case 'REMOTE':
      return 'Làm việc từ xa (Remote)';
    default:
      return mode || 'Tại văn phòng';
  }
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Application modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccessData, setApplySuccessData] = useState<{ applicationId?: string } | null>(null);

  // Form state
  // Form state initialized with pre-filled user data if available
  const [form, setForm] = useState<ApplyPayload>(() => {
    let fullName = '';
    let email = '';
    const rawUser = sessionStorage.getItem('user');
    if (rawUser) {
      try {
        const u = JSON.parse(rawUser);
        fullName = u.fullName || '';
        email = u.email || '';
      } catch {
        // ignore parse error
      }
    }
    return {
      fullName,
      email,
      phone: '',
      address: '',
      expectedSalary: undefined,
      currentCompany: '',
      cvUrl: '',
      coverNote: '',
    };
  });

  // Fetch job details
  useEffect(() => {
    let active = true;

    async function fetchJob() {
      if (!id) {
        setError('Mã tin tuyển dụng không hợp lệ.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await getJobDetail(id);
        if (active) {
          setJob(data);
        }
      } catch (err: unknown) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không thể tải thông tin tin tuyển dụng.');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void fetchJob();

    return () => {
      active = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="job-detail-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="pulse-dot" style={{ margin: '0 auto 16px', width: '20px', height: '20px' }} />
          <h3 style={{ color: '#475569', fontWeight: 600 }}>Đang tải thông tin tin tuyển dụng...</h3>
          <p style={{ color: '#94a3b8', fontSize: '14px' }}>Vui lòng đợi trong giây lát</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="job-detail-container" style={{ padding: '60px 24px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto', background: '#ffffff', padding: '40px', borderRadius: '16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ width: '56px', height: '56px', background: '#fee2e2', color: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '0 0 8px 0', color: '#0f172a' }}>Không tìm thấy tin tuyển dụng</h2>
          <p style={{ color: '#64748b', fontSize: '15px', lineHeight: 1.5, margin: '0 0 24px 0' }}>
            {error || 'Tin tuyển dụng này có thể chưa được xuất bản hoặc đường dẫn không còn tồn tại.'}
          </p>
          <button
            onClick={() => navigate('/jobs')}
            className="btn-apply-prominent"
            style={{ padding: '12px 24px', fontSize: '14px' }}
          >
            <ArrowLeft size={16} /> Xem các việc làm khác
          </button>
        </div>
      </div>
    );
  }

  // Determine if job is expired
  const isExpired = Boolean(job.isExpired || job.status === 'CLOSED');

  const formattedDeadline = formatDate(job.applicationDeadline);
  const companyProfile = job.companyProfile;
  const companyName = companyProfile?.companyName || job.companyName || 'ATS Recruitment';

  const handleOpenModal = () => {
    if (isExpired) return; // Do not open modal if expired
    setApplyError(null);
    setApplySuccessData(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleInputChange = (field: keyof ApplyPayload, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmitApplication = async (e: FormEvent) => {
    e.preventDefault();
    if (isExpired) {
      setApplyError('Tin tuyển dụng này đã hết hạn nhận hồ sơ.');
      return;
    }

    if (!form.fullName.trim()) {
      setApplyError('Vui lòng nhập Họ và tên.');
      return;
    }

    if (!form.email.trim() || !form.email.includes('@')) {
      setApplyError('Vui lòng nhập Email hợp lệ.');
      return;
    }

    if (!form.phone?.trim()) {
      setApplyError('Vui lòng nhập Số điện thoại.');
      return;
    }

    if (!form.cvUrl?.trim()) {
      setApplyError('Vui lòng nhập đường dẫn CV / Hồ sơ năng lực.');
      return;
    }

    setApplySubmitting(true);
    setApplyError(null);

    try {
      const result = await applyForJob(job.id, {
        ...form,
        expectedSalary: form.expectedSalary ? Number(form.expectedSalary) : undefined,
      });
      setApplySuccessData(result);
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : 'Ứng tuyển thất bại. Vui lòng thử lại.');
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: job.title,
        text: `Tuyển dụng vị trí ${job.title} tại ${companyName}`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Đã sao chép liên kết tin tuyển dụng vào bộ nhớ tạm!');
    }
  };

  return (
    <div className="job-detail-container">
      {/* Top Navigation Bar */}
      <header className="job-detail-top-bar">
        <div className="job-detail-top-content">
          <button
            onClick={() => navigate('/jobs')}
            className="job-detail-back-btn"
            id="btn-back-jobs"
          >
            <ArrowLeft size={18} />
            <span>Danh sách việc làm</span>
          </button>

          <div className="job-detail-top-actions">
            <button
              onClick={handleShare}
              className="job-detail-back-btn"
              title="Chia sẻ tin tuyển dụng"
            >
              <Share2 size={16} />
              <span>Chia sẻ</span>
            </button>

            {!isExpired ? (
              <button
                onClick={handleOpenModal}
                className="btn-apply-prominent"
                style={{ padding: '8px 20px', fontSize: '14px' }}
                id="btn-apply-top"
              >
                <Send size={15} />
                <span>Ứng tuyển ngay</span>
              </button>
            ) : (
              <span className="btn-apply-disabled" style={{ padding: '8px 16px', fontSize: '13px' }}>
                Đã hết hạn
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="job-detail-hero">
        <div className="job-detail-hero-inner">
          <nav className="job-detail-breadcrumb" aria-label="Breadcrumb">
            <Link to="/dashboard">Trang chủ</Link>
            <span>/</span>
            <Link to="/jobs">Việc làm</Link>
            <span>/</span>
            <strong style={{ color: '#ffffff' }}>{job.title}</strong>
          </nav>

          <div className="job-detail-hero-header">
            <div>
              <h1 className="job-detail-title">{job.title}</h1>
              <div className="job-detail-company-line">
                <Building size={18} />
                <span className="job-detail-company-name">{companyName}</span>
                {companyProfile?.tagline && (
                  <span style={{ color: '#94a3b8', fontSize: '14px' }}>• {companyProfile.tagline}</span>
                )}
              </div>
            </div>

            {/* Desktop Hero Apply CTA */}
            <div>
              {!isExpired ? (
                <button
                  onClick={handleOpenModal}
                  className="btn-apply-prominent"
                  id="btn-apply-hero"
                >
                  <Send size={18} />
                  <span>Ứng tuyển ngay</span>
                </button>
              ) : (
                <button disabled className="btn-apply-disabled">
                  <Clock size={18} />
                  <span>Đã hết hạn nộp hồ sơ</span>
                </button>
              )}
            </div>
          </div>

          {/* Chips & Badges */}
          <div className="job-detail-chips">
            {/* Status Chip */}
            {!isExpired ? (
              <div className="job-chip job-chip--active">
                <span className="pulse-dot" />
                <span>Đang nhận hồ sơ</span>
              </div>
            ) : (
              <div className="job-chip job-chip--expired">
                <AlertTriangle size={14} />
                <span>Đã hết hạn</span>
              </div>
            )}

            {/* Department */}
            {job.department && (
              <div className="job-chip">
                <Briefcase size={14} />
                <span>Phòng ban: {job.department.name}</span>
              </div>
            )}

            {/* Work Mode */}
            <div className="job-chip">
              <Building size={14} />
              <span>{getWorkModeLabel(job.workMode)}</span>
            </div>

            {/* Location */}
            <div className="job-chip">
              <MapPin size={14} />
              <span>{job.location || 'Hà Nội, Việt Nam'}</span>
            </div>

            {/* Salary */}
            <div className="job-chip job-chip--salary">
              <DollarSign size={14} />
              <span>Mức lương: {job.salary?.displayText || 'Thoả thuận'}</span>
            </div>

            {/* Deadline */}
            <div className={`job-chip ${isExpired ? 'job-chip--expired' : 'job-chip--deadline'}`}>
              <Calendar size={14} />
              <span>Hạn nộp: {formattedDeadline}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="job-detail-body">
        {/* Left Column: Job Details */}
        <div className="job-detail-main">
          {/* SCRUM-107 REQUIREMENT: Notice replaces application form when expired */}
          {isExpired && (
            <div className="job-expired-banner" role="alert" id="job-expired-notice">
              <div className="job-expired-icon">
                <AlertTriangle size={24} />
              </div>
              <div className="job-expired-content">
                <h3>Vị trí tuyển dụng này đã hết hạn nhận hồ sơ</h3>
                <p>
                  Thời hạn tiếp nhận hồ sơ cho vị trí <strong>{job.title}</strong> đã kết thúc vào ngày <strong>{formattedDeadline}</strong>.
                  Hệ thống đã dừng tiếp nhận hồ sơ mới cho đợt tuyển dụng này. Bạn vui lòng xem các vị trí đang mở khác để tìm kiếm cơ hội phù hợp!
                </p>
                <button onClick={() => navigate('/jobs')} className="job-expired-btn">
                  <Briefcase size={15} />
                  <span>Khám phá các vị trí đang mở khác</span>
                </button>
              </div>
            </div>
          )}

          {/* 1. Mô tả công việc (Job Description) */}
          <section className="job-section-card" id="section-description">
            <h2>
              <FileText className="job-section-icon" size={22} />
              <span>Mô tả công việc</span>
            </h2>
            <div className="job-formatted-text">
              {job.description}
            </div>
          </section>

          {/* 2. Yêu cầu công việc (Job Requirements) */}
          <section className="job-section-card" id="section-requirements">
            <h2>
              <CheckCircle2 className="job-section-icon" size={22} />
              <span>Yêu cầu ứng viên</span>
            </h2>
            <div className="job-formatted-text">
              {job.requisition?.requirements ? (
                job.requisition.requirements
              ) : (
                <>
                  <p>Để đảm nhận tốt vị trí này, ứng viên cần đáp ứng các tiêu chuẩn sau:</p>
                  <ul>
                    <li>Có kinh nghiệm thực tế ở vị trí tương đương phù hợp với yêu cầu chuyên môn.</li>
                    <li>Khả năng làm việc độc lập và phối hợp làm việc nhóm hiệu quả.</li>
                    <li>Tư duy giải quyết vấn đề sáng tạo, tinh thần trách nhiệm và chủ động trong công việc.</li>
                    <li>Sẵn sàng học hỏi công nghệ và phương pháp làm việc mới.</li>
                  </ul>
                </>
              )}
            </div>
          </section>

          {/* 3. Quyền lợi & Chế độ đãi ngộ (Benefits) */}
          <section className="job-section-card" id="section-benefits">
            <h2>
              <Gift className="job-section-icon" size={22} />
              <span>Quyền lợi & Chế độ đãi ngộ</span>
            </h2>

            {companyProfile?.benefits && (
              <div className="job-formatted-text" style={{ marginBottom: '20px' }}>
                {companyProfile.benefits}
              </div>
            )}

            <div className="benefits-grid">
              <div className="benefit-item">
                <div className="benefit-icon">
                  <DollarSign size={20} />
                </div>
                <div>
                  <div className="benefit-title">Thu nhập hấp dẫn</div>
                  <div className="benefit-desc">Lương cạnh tranh theo năng lực, xét tăng lương định kỳ & thưởng hiệu suất dự án.</div>
                </div>
              </div>

              <div className="benefit-item">
                <div className="benefit-icon">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <div className="benefit-title">Bảo hiểm & Sức khỏe</div>
                  <div className="benefit-desc">Đầy đủ chế độ BHXH theo luật, gói bảo hiểm sức khỏe cao cấp khám chữa bệnh hàng năm.</div>
                </div>
              </div>

              <div className="benefit-item">
                <div className="benefit-icon">
                  <Sparkles size={20} />
                </div>
                <div>
                  <div className="benefit-title">Phát triển nghề nghiệp</div>
                  <div className="benefit-desc">Lộ trình thăng tiến rõ ràng, ngân sách tài trợ các khóa đào tạo và thi chứng chỉ chuyên môn.</div>
                </div>
              </div>

              <div className="benefit-item">
                <div className="benefit-icon">
                  <Building size={20} />
                </div>
                <div>
                  <div className="benefit-title">Môi trường chuyên nghiệp</div>
                  <div className="benefit-desc">Trang thiết bị hiện đại, văn hóa cởi mở, tôn trọng sáng kiến và hỗ trợ lẫn nhau.</div>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Quy trình tuyển dụng (Hiring Process Timeline) */}
          <section className="job-section-card" id="section-process">
            <h2>
              <Clock className="job-section-icon" size={22} />
              <span>Quy trình tuyển dụng</span>
            </h2>
            <div className="process-timeline">
              <div className="process-step">
                <div className="step-number">01</div>
                <div className="step-name">Nộp hồ sơ</div>
                <div className="step-desc">Gửi CV ứng tuyển trực tuyến</div>
              </div>
              <div className="process-step">
                <div className="step-number">02</div>
                <div className="step-name">Sàng lọc CV</div>
                <div className="step-desc">Đánh giá độ phù hợp (1-2 ngày)</div>
              </div>
              <div className="process-step">
                <div className="step-number">03</div>
                <div className="step-name">Phỏng vấn</div>
                <div className="step-desc">Gặp gỡ trực tiếp hoặc online</div>
              </div>
              <div className="process-step">
                <div className="step-number">04</div>
                <div className="step-name">Nhận Offer</div>
                <div className="step-desc">Thoả thuận đãi ngộ & Onboarding</div>
              </div>
            </div>
          </section>

          {/* 5. Về công ty chúng tôi (About Company) */}
          {companyProfile && (
            <section className="job-section-card" id="section-company">
              <h2>
                <Building className="job-section-icon" size={22} />
                <span>Về chúng tôi - {companyName}</span>
              </h2>
              <div className="job-formatted-text">
                {companyProfile.introduction || 'Chào mừng bạn đến với cổng thông tin tuyển dụng của công ty.'}
              </div>
              {companyProfile.culture && (
                <div style={{ marginTop: '16px' }}>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', color: '#0f172a' }}>Văn hóa doanh nghiệp:</h4>
                  <div className="job-formatted-text">{companyProfile.culture}</div>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Right Column: Sticky Sidebar Card */}
        <aside className="job-detail-sidebar">
          <div className="job-sidebar-card sticky-card">
            <h3 className="job-sidebar-title">Thông tin vị trí</h3>

            <div className="job-summary-list">
              <div className="job-summary-item">
                <div className="job-summary-icon">
                  <Calendar size={18} />
                </div>
                <div>
                  <div className="job-summary-label">Hạn nộp hồ sơ</div>
                  <div className="job-summary-value" style={{ color: isExpired ? '#dc2626' : undefined }}>
                    {formattedDeadline} {isExpired ? '(Đã hết hạn)' : ''}
                  </div>
                </div>
              </div>

              <div className="job-summary-item">
                <div className="job-summary-icon">
                  <DollarSign size={18} />
                </div>
                <div>
                  <div className="job-summary-label">Mức lương dự kiến</div>
                  <div className="job-summary-value" style={{ color: '#16a34a' }}>
                    {job.salary?.displayText || 'Thoả thuận'}
                  </div>
                </div>
              </div>

              <div className="job-summary-item">
                <div className="job-summary-icon">
                  <MapPin size={18} />
                </div>
                <div>
                  <div className="job-summary-label">Địa điểm làm việc</div>
                  <div className="job-summary-value">{job.location || 'Hà Nội, Việt Nam'}</div>
                </div>
              </div>

              <div className="job-summary-item">
                <div className="job-summary-icon">
                  <Building size={18} />
                </div>
                <div>
                  <div className="job-summary-label">Hình thức làm việc</div>
                  <div className="job-summary-value">{getWorkModeLabel(job.workMode)}</div>
                </div>
              </div>

              {job.department && (
                <div className="job-summary-item">
                  <div className="job-summary-icon">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <div className="job-summary-label">Phòng ban</div>
                    <div className="job-summary-value">{job.department.name}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar CTA Action */}
            <div className="job-sidebar-actions">
              {!isExpired ? (
                <>
                  <button
                    onClick={handleOpenModal}
                    className="btn-apply-prominent"
                    id="btn-apply-sidebar"
                  >
                    <Send size={18} />
                    <span>Ứng tuyển ngay</span>
                  </button>
                  <p style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', margin: '4px 0 0 0' }}>
                    Quy trình ứng tuyển nhanh chóng chỉ trong 1 phút
                  </p>
                </>
              ) : (
                <>
                  <button disabled className="btn-apply-disabled" id="btn-apply-disabled-sidebar">
                    <Clock size={18} />
                    <span>Đã hết hạn nhận hồ sơ</span>
                  </button>
                  <p className="job-expiry-hint">
                    Vị trí này đã đóng tiếp nhận ứng viên mới
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Company Info Card */}
          <div className="job-sidebar-card">
            <h3 className="job-sidebar-title">Nhà tuyển dụng</h3>
            <div className="company-profile-preview">
              <div className="company-logo-placeholder">
                {companyName.slice(0, 2).toUpperCase()}
              </div>
              <div className="company-info">
                <h4>{companyName}</h4>
                <p>{companyProfile?.location || 'Hà Nội, Việt Nam'}</p>
              </div>
            </div>

            <div className="company-links">
              {companyProfile?.website && (
                <a
                  href={companyProfile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="company-link-item"
                >
                  <ExternalLink size={15} />
                  <span>Trang web chính thức</span>
                </a>
              )}
              {companyProfile?.contactEmail && (
                <a
                  href={`mailto:${companyProfile.contactEmail}`}
                  className="company-link-item"
                >
                  <Mail size={15} />
                  <span>{companyProfile.contactEmail}</span>
                </a>
              )}
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile Sticky Bottom Action Bar (Requirement: "hiển thị tốt trên điện thoại") */}
      <div className="mobile-bottom-bar" id="mobile-bottom-bar">
        <div className="mobile-bottom-content">
          <div className="mobile-bottom-info">
            <div className="mobile-bottom-title">{job.title}</div>
            <div className="mobile-bottom-meta">
              {isExpired ? (
                <span style={{ color: '#dc2626', fontWeight: 600 }}>Đã hết hạn nộp hồ sơ</span>
              ) : (
                <span>Hạn nộp: {formattedDeadline}</span>
              )}
            </div>
          </div>

          {!isExpired ? (
            <button
              onClick={handleOpenModal}
              className="btn-apply-prominent"
              id="btn-apply-mobile"
            >
              <Send size={16} />
              <span>Ứng tuyển ngay</span>
            </button>
          ) : (
            <button disabled className="btn-apply-disabled" id="btn-apply-disabled-mobile">
              <span>Đã hết hạn</span>
            </button>
          )}
        </div>
      </div>

      {/* Application Form Modal (Requirement: "Tin đã hết hạn hiển thị thông báo thay vì biểu mẫu ứng tuyển") */}
      {!isExpired && isModalOpen && (
        <div className="app-modal-overlay" onClick={handleCloseModal}>
          <div className="app-modal" onClick={(e) => e.stopPropagation()}>
            <div className="app-modal-header">
              <h3>Ứng tuyển vị trí: {job.title}</h3>
              <button
                onClick={handleCloseModal}
                className="app-modal-close-btn"
                aria-label="Đóng"
                id="btn-close-modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="app-modal-body">
              {applySuccessData ? (
                <div className="app-success-card" id="apply-success-card">
                  <div className="app-success-icon">
                    <CheckCircle2 size={36} />
                  </div>
                  <h3>Nộp hồ sơ thành công!</h3>
                  <p>
                    Cảm ơn bạn đã ứng tuyển vào vị trí <strong>{job.title}</strong> tại <strong>{companyName}</strong>.
                    Bộ phận tuyển dụng sẽ xem xét hồ sơ và liên hệ với bạn trong vòng 2-3 ngày làm việc.
                  </p>
                  {applySuccessData.applicationId && (
                    <div className="app-success-badge">
                      Mã hồ sơ: {applySuccessData.applicationId}
                    </div>
                  )}
                  <div>
                    <button
                      onClick={handleCloseModal}
                      className="btn-apply-prominent"
                      style={{ padding: '10px 24px', fontSize: '14px' }}
                    >
                      Đã hiểu và Đóng
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmitApplication} id="form-apply">
                  {applyError && (
                    <div className="app-form-error" role="alert">
                      <AlertTriangle size={18} />
                      <span>{applyError}</span>
                    </div>
                  )}

                  <div className="app-form-row">
                    <div className="app-form-group">
                      <label htmlFor="apply-fullName">
                        Họ và tên <span className="required">*</span>
                      </label>
                      <input
                        id="apply-fullName"
                        type="text"
                        className="app-form-input"
                        placeholder="Nguyễn Văn A"
                        value={form.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        required
                      />
                    </div>

                    <div className="app-form-group">
                      <label htmlFor="apply-email">
                        Địa chỉ Email <span className="required">*</span>
                      </label>
                      <input
                        id="apply-email"
                        type="email"
                        className="app-form-input"
                        placeholder="candidate@example.com"
                        value={form.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="app-form-row">
                    <div className="app-form-group">
                      <label htmlFor="apply-phone">
                        Số điện thoại <span className="required">*</span>
                      </label>
                      <input
                        id="apply-phone"
                        type="tel"
                        className="app-form-input"
                        placeholder="0912 345 678"
                        value={form.phone || ''}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        required
                      />
                    </div>

                    <div className="app-form-group">
                      <label htmlFor="apply-salary">
                        Mức lương mong muốn (VNĐ/tháng)
                      </label>
                      <input
                        id="apply-salary"
                        type="number"
                        className="app-form-input"
                        placeholder="VD: 25000000"
                        value={form.expectedSalary || ''}
                        onChange={(e) => handleInputChange('expectedSalary', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="app-form-group">
                    <label htmlFor="apply-cvUrl">
                      Liên kết CV / Portfolio (Google Drive, Dropbox, LinkedIn...) <span className="required">*</span>
                    </label>
                    <input
                      id="apply-cvUrl"
                      type="url"
                      className="app-form-input"
                      placeholder="https://drive.google.com/file/d/..."
                      value={form.cvUrl || ''}
                      onChange={(e) => handleInputChange('cvUrl', e.target.value)}
                      required
                    />
                  </div>

                  <div className="app-form-group">
                    <label htmlFor="apply-address">Địa chỉ cư trú</label>
                    <input
                      id="apply-address"
                      type="text"
                      className="app-form-input"
                      placeholder="Quận Cầu Giấy, Hà Nội"
                      value={form.address || ''}
                      onChange={(e) => handleInputChange('address', e.target.value)}
                    />
                  </div>

                  <div className="app-form-group">
                    <label htmlFor="apply-coverNote">Lời nhắn gửi đến nhà tuyển dụng</label>
                    <textarea
                      id="apply-coverNote"
                      className="app-form-textarea"
                      placeholder="Tóm tắt ngắn gọn lý do bạn phù hợp với vị trí này..."
                      value={form.coverNote || ''}
                      onChange={(e) => handleInputChange('coverNote', e.target.value)}
                    />
                  </div>

                  <div className="app-modal-footer" style={{ padding: '16px 0 0 0', background: 'transparent' }}>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="btn-secondary"
                      disabled={applySubmitting}
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="btn-apply-prominent"
                      style={{ padding: '10px 24px', fontSize: '14px' }}
                      disabled={applySubmitting}
                      id="btn-submit-application"
                    >
                      {applySubmitting ? (
                        <span>Đang gửi hồ sơ...</span>
                      ) : (
                        <>
                          <Send size={15} />
                          <span>Gửi hồ sơ ứng tuyển</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
