import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  MapPin,
  Calendar,
  DollarSign,
  Search,
  Building,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { getPublicJobs } from '../services/jobApi';
import type { JobDetail } from '../services/jobApi';
import './CandidateJobsPage.css';

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

export default function CandidateJobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedWorkMode, setSelectedWorkMode] = useState('ALL');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getPublicJobs()
      .then((data) => {
        if (!active) return;
        setJobs(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Không thể tải danh sách việc làm.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Filter jobs
  const departments = Array.from(
    new Set(jobs.map((j) => j.department?.name).filter(Boolean))
  ) as string[];

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (job.location && job.location.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesDept =
      selectedDept === 'ALL' || job.department?.name === selectedDept;

    const matchesWorkMode =
      selectedWorkMode === 'ALL' || job.workMode === selectedWorkMode;

    return matchesSearch && matchesDept && matchesWorkMode;
  });

  return (
    <div className="candidate-jobs-container">
      {/* Hero Header */}
      <section className="candidate-jobs-hero">
        <h1>Cơ hội nghề nghiệp & Việc làm hấp dẫn</h1>
        <p>
          Khám phá các vị trí tuyển dụng mở tại công ty chúng tôi. Môi trường làm việc chuyên nghiệp,
          đãi ngộ cạnh tranh cùng cơ hội phát triển sự nghiệp rộng mở.
        </p>
      </section>

      {/* Main Content */}
      <main className="candidate-jobs-main">
        {/* Search & Filter Bar */}
        <div className="jobs-filter-card">
          <div className="jobs-search-box">
            <Search className="jobs-search-icon" size={18} />
            <input
              type="text"
              className="jobs-search-input"
              placeholder="Tìm kiếm theo chức danh, từ khóa hoặc địa điểm..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              id="input-search-jobs"
            />
          </div>

          <select
            className="jobs-select-filter"
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            id="select-dept-filter"
          >
            <option value="ALL">Tất cả phòng ban</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>

          <select
            className="jobs-select-filter"
            value={selectedWorkMode}
            onChange={(e) => setSelectedWorkMode(e.target.value)}
            id="select-workmode-filter"
          >
            <option value="ALL">Tất cả hình thức</option>
            <option value="ONSITE">Tại văn phòng (Onsite)</option>
            <option value="HYBRID">Linh hoạt (Hybrid)</option>
            <option value="REMOTE">Từ xa (Remote)</option>
          </select>
        </div>

        {/* Content list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <div className="pulse-dot" style={{ margin: '0 auto 16px', width: '20px', height: '20px' }} />
            <p style={{ color: '#64748b', fontSize: '15px' }}>Đang tải danh sách việc làm...</p>
          </div>
        ) : error ? (
          <div className="jobs-empty-state">
            <AlertTriangle size={32} style={{ color: '#dc2626' }} />
            <h3>Không thể tải danh sách việc làm</h3>
            <p>{error}</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="jobs-empty-state">
            <Briefcase size={36} style={{ color: '#94a3b8' }} />
            <h3>Chưa tìm thấy vị trí tuyển dụng phù hợp</h3>
            <p>Vui lòng thử điều chỉnh lại từ khóa hoặc bộ lọc tìm kiếm.</p>
          </div>
        ) : (
          <div className="jobs-grid">
            {filteredJobs.map((job) => {
              const isExpired = Boolean(
                job.isExpired ||
                job.status === 'CLOSED' ||
                (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now())
              );

              return (
                <div key={job.id} className="job-card" id={`job-card-${job.id}`}>
                  <div>
                    <div className="job-card-header">
                      <h3 className="job-card-title">{job.title}</h3>
                      {job.department && (
                        <div className="job-card-dept">
                          <Building size={14} />
                          <span>{job.department.name}</span>
                        </div>
                      )}
                    </div>

                    <div className="job-card-meta">
                      {job.salary?.displayText && (
                        <div className="job-meta-chip salary">
                          <DollarSign size={13} />
                          <span>{job.salary.displayText}</span>
                        </div>
                      )}

                      <div className="job-meta-chip">
                        <MapPin size={13} />
                        <span>{job.location || 'Hà Nội'}</span>
                      </div>

                      <div className={`job-meta-chip ${isExpired ? 'expired' : 'deadline'}`}>
                        <Calendar size={13} />
                        <span>Hạn: {formatDate(job.applicationDeadline)}</span>
                      </div>
                    </div>

                    <div className="job-card-desc">
                      {job.description}
                    </div>
                  </div>

                  <div className="job-card-footer">
                    <span className="job-card-date">
                      Đăng: {formatDate(job.createdAt)}
                    </span>
                    <button
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className="btn-view-job"
                      id={`btn-view-${job.id}`}
                    >
                      <span>Xem chi tiết</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
