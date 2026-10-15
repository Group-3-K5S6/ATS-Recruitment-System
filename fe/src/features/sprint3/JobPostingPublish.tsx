import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  MapPin,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";

import { atsApi } from "./api";
import "./job-posting-publish.css";

type Job = {
  id: string;
  title: string;
  requisitionId?: string | null;
  departmentId: string;
  hiringManagerId: string;
  recruiterId?: string | null;
  jobTitleId?: string | null;
  status: string;
  description: string;
  location: string;
  workMode?: string | null;
  applicationDeadline?: string | null;
  showSalary?: boolean;
  createdAt?: string;
  updatedAt?: string;

  department?: {
    id?: string;
    name?: string;
  } | null;

  hiringManager?: {
    id: string;
    fullName: string;
    email: string;
  } | null;

  recruiter?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

function formatDate(value?: string | null) {
  if (!value) {
    return "Chưa thiết lập";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN").format(date);
}

function workModeLabel(value?: string | null) {
  switch (value) {
    case "REMOTE":
      return "Làm việc từ xa";
    case "HYBRID":
      return "Kết hợp";
    case "ONSITE":
      return "Tại văn phòng";
    default:
      return value || "Chưa xác định";
  }
}

export default function JobPostingPublish() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");

  const [previewJob, setPreviewJob] = useState<Job | null>(null);

  const loadJobs = async () => {
    try {
      setLoading(true);
      setError("");

      const result = await atsApi<Job[]>("/api/jobs");

      setJobs(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể tải danh sách tin tuyển dụng.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const draftJobs = useMemo(() => {
    return jobs.filter((job) => job.status === "DRAFT");
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return draftJobs;
    }

    return draftJobs.filter((job) => {
      return (
        job.title.toLowerCase().includes(keyword) ||
        job.id.toLowerCase().includes(keyword) ||
        (job.department?.name ?? "").toLowerCase().includes(keyword) ||
        job.location.toLowerCase().includes(keyword)
      );
    });
  }, [draftJobs, search]);

  const publishJob = async (job: Job) => {
    const confirmed = window.confirm(
      `Bạn xác nhận duyệt và xuất bản tin "${job.title}"?\n\nTin sẽ chuyển sang trạng thái PUBLISHED và có thể hiển thị công khai.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setPublishingId(job.id);
      setError("");
      setNotice("");

      const updated = await atsApi<Job>(
        `/api/jobs/${encodeURIComponent(job.id)}/publish`,
        "POST",
      );

      if (updated.status !== "PUBLISHED") {
        throw new Error(
          "Backend chưa xác nhận tin ở trạng thái PUBLISHED.",
        );
      }

      setNotice(`Đã duyệt và xuất bản tin "${job.title}".`);

      setJobs((current) =>
        current.map((item) => (item.id === job.id ? updated : item)),
      );

      setPreviewJob(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xuất bản tin tuyển dụng.",
      );
    } finally {
      setPublishingId(null);
    }
  };

  if (loading) {
    return (
      <section className="s310-page">
        <div className="s310-state">Đang tải danh sách tin tuyển dụng...</div>
      </section>
    );
  }

  return (
    <section className="s310-page">
      <header className="s310-header">
        <div>
          <h1>Duyệt và xuất bản tin tuyển dụng</h1>
          <p>
            Kiểm tra nội dung, xem trước giao diện ứng viên và xuất bản các tin
            tuyển dụng đã sẵn sàng.
          </p>
        </div>

        <div className="s310-summary">
          <Send size={20} />

          <div>
            <strong>{draftJobs.length}</strong>
            <span>Tin chờ duyệt</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="s310-alert s310-alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="s310-alert s310-alert-success">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
        </div>
      )}

      <div className="s310-toolbar">
        <div className="s310-search">
          <Search size={18} />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tiêu đề, phòng ban, địa điểm hoặc mã tin..."
          />
        </div>

        <span>{filteredJobs.length} tin chờ xử lý</span>
      </div>

      <div className="s310-table-wrapper">
        <table className="s310-table">
          <thead>
            <tr>
              <th>Tin tuyển dụng</th>
              <th>Phòng ban</th>
              <th>Địa điểm</th>
              <th>Hình thức</th>
              <th>Recruiter</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>

          <tbody>
            {filteredJobs.map((job) => (
              <tr key={job.id}>
                <td>
                  <div className="s310-job-name">
                    <strong>{job.title}</strong>
                    <span>{job.id}</span>
                  </div>
                </td>

                <td>{job.department?.name || "Chưa xác định"}</td>

                <td>{job.location || "Chưa xác định"}</td>

                <td>{workModeLabel(job.workMode)}</td>

                <td>{job.recruiter?.fullName || "Chưa phân công"}</td>

                <td>
                  <span className="s310-status">Bản nháp</span>
                </td>

                <td>
                  <div className="s310-actions">
                    <button
                      type="button"
                      className="s310-preview-button"
                      onClick={() => setPreviewJob(job)}
                    >
                      <Eye size={16} />
                      Xem trước
                    </button>

                    <button
                      type="button"
                      className="s310-publish-button"
                      disabled={publishingId === job.id}
                      onClick={() => void publishJob(job)}
                    >
                      <Send size={16} />
                      {publishingId === job.id
                        ? "Đang xuất bản..."
                        : "Duyệt & xuất bản"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {filteredJobs.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="s310-empty">
                    <CheckCircle2 size={32} />
                    <strong>Không có tin tuyển dụng đang chờ duyệt</strong>
                    <span>
                      Các tin ở trạng thái DRAFT sẽ xuất hiện tại đây.
                    </span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {previewJob && (
        <div className="s310-modal-backdrop">
          <div className="s310-modal">
            <div className="s310-modal-toolbar">
              <div>
                <strong>Xem trước tin tuyển dụng</strong>
                <span>Giao diện mô phỏng nội dung ứng viên sẽ xem.</span>
              </div>

              <button
                type="button"
                className="s310-close"
                onClick={() => setPreviewJob(null)}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="s310-public-preview">
              <div className="s310-public-heading">
                <div className="s310-company-logo">
                  {previewJob.department?.name?.charAt(0).toUpperCase() || "A"}
                </div>

                <div>
                  <span>TUYỂN DỤNG</span>
                  <h2>{previewJob.title}</h2>
                  <p>
                    {previewJob.department?.name || "Phòng ban chưa xác định"}
                  </p>
                </div>
              </div>

              <div className="s310-meta">
                <span>
                  <MapPin size={16} />
                  {previewJob.location || "Chưa xác định"}
                </span>

                <span>
                  <Users size={16} />
                  {workModeLabel(previewJob.workMode)}
                </span>
              </div>

              <div className="s310-public-section">
                <h3>Mô tả công việc</h3>
                <p>{previewJob.description}</p>
              </div>

              <div className="s310-public-section">
                <h3>Thông tin tuyển dụng</h3>

                <dl>
                  <div>
                    <dt>Phòng ban</dt>
                    <dd>
                      {previewJob.department?.name || "Chưa xác định"}
                    </dd>
                  </div>

                  <div>
                    <dt>Địa điểm</dt>
                    <dd>{previewJob.location}</dd>
                  </div>

                  <div>
                    <dt>Hình thức</dt>
                    <dd>{workModeLabel(previewJob.workMode)}</dd>
                  </div>

                  <div>
                    <dt>Hạn ứng tuyển</dt>
                    <dd>{formatDate(previewJob.applicationDeadline)}</dd>
                  </div>
                </dl>
              </div>

              <div className="s310-public-footer">
                <span>
                  Đây là bản xem trước. Tin chưa hiển thị công khai khi còn ở
                  trạng thái DRAFT.
                </span>

                <button
                  type="button"
                  className="s310-publish-button"
                  disabled={publishingId === previewJob.id}
                  onClick={() => void publishJob(previewJob)}
                >
                  <Send size={17} />
                  {publishingId === previewJob.id
                    ? "Đang xuất bản..."
                    : "Duyệt & xuất bản"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}