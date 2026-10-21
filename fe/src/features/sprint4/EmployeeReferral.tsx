import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BriefcaseBusiness,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  isOpenPublicJob,
  type PublicJobListing,
} from "./publicJobFilters";
import "./employee-referral.css";

const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type SessionUser = {
  id: string;
  fullName: string;
  email?: string;
  roles?: string[];
};

type ReferralForm = {
  jobId: string;
  fullName: string;
  email: string;
  phone: string;
  note: string;
};

const EMPTY_FORM: ReferralForm = {
  jobId: "",
  fullName: "",
  email: "",
  phone: "",
  note: "",
};

function getSessionUser(): SessionUser | null {
  try {
    const stored = sessionStorage.getItem("atsUser");

    return stored
      ? (JSON.parse(stored) as SessionUser)
      : null;
  } catch {
    return null;
  }
}

export default function EmployeeReferral() {
  const currentUser = getSessionUser();

  const [jobs, setJobs] = useState<PublicJobListing[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");

  const [form, setForm] =
    useState<ReferralForm>(EMPTY_FORM);

  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadJobs() {
      setLoadingJobs(true);
      setJobsError("");

      try {
        const response = await fetch(
          `${API_URL}/api/public/jobs`,
          {
            signal: controller.signal,
          },
        );

        const result =
          (await response.json()) as ApiResponse<
            PublicJobListing[]
          >;

        if (
          !response.ok ||
          !result.success ||
          !Array.isArray(result.data)
        ) {
          throw new Error(
            result.error?.message ||
              "Không thể tải danh sách vị trí đang tuyển.",
          );
        }

        setJobs(
          result.data.filter((job) =>
            isOpenPublicJob(job),
          ),
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        setJobsError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách vị trí đang tuyển.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingJobs(false);
        }
      }
    }

    void loadJobs();

    return () => controller.abort();
  }, []);

  const selectedJob = useMemo(
    () =>
      jobs.find((job) => job.id === form.jobId) ??
      null,
    [jobs, form.jobId],
  );

  const validEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      form.email.trim(),
    );

  const canSubmit =
    Boolean(form.jobId) &&
    form.fullName.trim().length >= 2 &&
    validEmail &&
    form.note.trim().length > 0;

  function edit(
    field: keyof ReferralForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setSubmitError("");
  }

  function submitReferral(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setSubmitError("");

    if (!canSubmit) {
      setSubmitError(
        "Vui lòng chọn vị trí, nhập họ tên, email hợp lệ và ghi chú giới thiệu.",
      );
      return;
    }

    /*
     * S4-07:
     * Backend hiện chưa có API/trường dữ liệu referral để lưu:
     * - nguồn Giới thiệu nội bộ
     * - người giới thiệu
     * - ghi chú giới thiệu
     * - trạng thái dành cho người giới thiệu theo dõi
     *
     * Không tạo Candidate/Application không có metadata referral
     * vì sẽ làm mất nguồn hồ sơ theo Acceptance Criteria.
     */
    setSubmitError(
      "Backend hiện chưa hỗ trợ lưu hồ sơ giới thiệu nội bộ. Dữ liệu chưa được gửi hoặc ghi vào hệ thống.",
    );
  }

  return (
    <section className="s407-page">
      <header className="s407-header">
        <div>
          <span className="s407-eyebrow">
            GIỚI THIỆU ỨNG VIÊN
          </span>

          <h1>Giới thiệu người quen</h1>

          <p>
            Giới thiệu ứng viên cho một vị trí đang tuyển
            và theo dõi kết quả ở mức tổng quát.
          </p>
        </div>
      </header>

      {jobsError && (
        <div
          className="s407-alert s407-alert--error"
          role="alert"
        >
          <AlertCircle size={18} />
          <span>{jobsError}</span>
        </div>
      )}

      {submitError && (
        <div
          className="s407-alert s407-alert--warning"
          role="alert"
        >
          <AlertCircle size={18} />
          <span>{submitError}</span>
        </div>
      )}

      <div className="s407-layout">
        <form
          className="s407-card s407-form-card"
          onSubmit={submitReferral}
        >
          <div className="s407-card-title">
            <div className="s407-icon">
              <UserPlus size={21} />
            </div>

            <div>
              <h2>Thông tin giới thiệu</h2>
              <p>
                Nhập thông tin người được giới thiệu và
                vị trí phù hợp.
              </p>
            </div>
          </div>

          <div className="s407-form">
            <label>
              <span>
                <BriefcaseBusiness size={16} />
                Vị trí đang tuyển *
              </span>

              <select
                value={form.jobId}
                disabled={loadingJobs}
                onChange={(event) =>
                  edit("jobId", event.target.value)
                }
              >
                <option value="">
                  {loadingJobs
                    ? "Đang tải vị trí..."
                    : "Chọn vị trí tuyển dụng"}
                </option>

                {jobs.map((job) => (
                  <option
                    key={job.id}
                    value={job.id}
                  >
                    {job.title}
                    {job.department?.name
                      ? ` — ${job.department.name}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            {selectedJob && (
              <div className="s407-job-preview">
                <strong>{selectedJob.title}</strong>

                <span>
                  {selectedJob.department?.name ||
                    "Chưa có phòng ban"}
                  {" · "}
                  {selectedJob.location ||
                    "Chưa có địa điểm"}
                </span>
              </div>
            )}

            <label>
              <span>
                <UserRound size={16} />
                Họ và tên người được giới thiệu *
              </span>

              <input
                value={form.fullName}
                onChange={(event) =>
                  edit(
                    "fullName",
                    event.target.value,
                  )
                }
                placeholder="Nguyễn Văn A"
              />
            </label>

            <label>
              <span>
                <Mail size={16} />
                Email *
              </span>

              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  edit("email", event.target.value)
                }
                placeholder="candidate@example.com"
              />
            </label>

            <label>
              <span>
                <Phone size={16} />
                Số điện thoại
              </span>

              <input
                value={form.phone}
                onChange={(event) =>
                  edit("phone", event.target.value)
                }
                placeholder="09xxxxxxxx"
              />
            </label>

            <label>
              <span>
                <MessageSquareText size={16} />
                Ghi chú giới thiệu *
              </span>

              <textarea
                rows={5}
                value={form.note}
                onChange={(event) =>
                  edit("note", event.target.value)
                }
                placeholder="Ví dụ: Tôi đã làm việc cùng ứng viên và đánh giá phù hợp với vị trí..."
              />
            </label>
          </div>

          <button
            type="submit"
            className="s407-submit"
            disabled={!canSubmit || loadingJobs}
          >
            <Send size={18} />
            Gửi giới thiệu
          </button>
        </form>

        <aside className="s407-side">
          <section className="s407-card">
            <div className="s407-card-title">
              <div className="s407-icon">
                <ShieldCheck size={21} />
              </div>

              <div>
                <h2>Nguồn hồ sơ</h2>
                <p>
                  Thông tin phải được lưu cùng hồ sơ
                  giới thiệu.
                </p>
              </div>
            </div>

            <dl className="s407-source">
              <div>
                <dt>Nguồn</dt>
                <dd>Giới thiệu nội bộ</dd>
              </div>

              <div>
                <dt>Người giới thiệu</dt>
                <dd>
                  {currentUser?.fullName ||
                    "Không xác định"}
                </dd>
              </div>

              {currentUser?.email && (
                <div>
                  <dt>Email người giới thiệu</dt>
                  <dd>{currentUser.email}</dd>
                </div>
              )}
            </dl>

            <p className="s407-source-note">
              Các thông tin nguồn này không được tự
              ghi vào Candidate/Application hiện tại
              vì Backend chưa có trường tương ứng.
            </p>
          </section>

          <section className="s407-card">
            <div className="s407-card-title">
              <div className="s407-icon">
                <Clock3 size={21} />
              </div>

              <div>
                <h2>Theo dõi giới thiệu</h2>
                <p>
                  Trạng thái hồ sơ chỉ hiển thị ở mức
                  tổng quát.
                </p>
              </div>
            </div>

            <div className="s407-tracking-empty">
              <Clock3 size={30} />

              <strong>
                Chưa có dữ liệu theo dõi
              </strong>

              <span>
                Backend hiện chưa có API lưu và truy
                vấn các hồ sơ do nhân viên nội bộ
                giới thiệu.
              </span>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}