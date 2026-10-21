import { useEffect, useState } from "react";

import Sidebar from "./Sidebar";

import AccountManagement from "../pages/AccountManagement";

import RoleAndPermissionManagement from "../pages/RoleAndPermissionManagement";

import UserProfilePage from "../pages/UserProfilePage";

import type { Role } from "../data/roleMenus";

import { useNavigate } from "react-router-dom";

type DashboardProps = {
  role: Role;

  userName: string;

  onLogout: () => Promise<void>;
};

type DashboardMetrics = {
  totalJobs: number;
  totalCandidates: number;
  totalInterviews: number;
  totalOffers: number;
  totalRecruiters: number | null;
  approvedBudget: number | null;
};

type AdminOverview = {
  totalUsers: number;
  totalRoles: number;
  totalCategories: number | null;
  totalAuditLogs: number;
  categoryWarning: string | null;
  roleStats: {
    role: string;
    count: number;
    activeCount: number;
  }[];
  recentLogs: {
    id: string;
    createdAt: string;
    actorName: string;
    action: string;
    ipAddress: string | null;
  }[];
};

type AdminOverviewResponse = {
  success: boolean;
  data?: AdminOverview;
  error?: { message?: string };
};

const ROLE_NAMES: Record<string, string> = {
  CANDIDATE: "Ứng viên",
  RECRUITER: "Nhân viên tuyển dụng",
  HIRING_MANAGER: "Trưởng bộ phận",
  INTERVIEWER: "Người phỏng vấn",
  HR_MANAGER: "Trưởng phòng Nhân sự",
  APPROVER: "Người duyệt",
  ADMIN: "Quản trị hệ thống",
};

type DepartmentStat = {
  departmentId: string;
  departmentName: string;
  publishedJobs: number;
  candidateCount: number;
  acceptedOffers: number;
  status: string;
};

type RecruiterStat = {
  recruiterId: string;
  recruiterName: string;
  assignedJobs: number;
  publishedJobs: number;
  candidateCount: number;
  acceptedOffers: number;
};

type RecruiterJob = {
  id: string;
  title: string;
  department: {
    name: string;
  } | null;
  candidateCount: number;
  status: string;
};

type RecruiterJobsResponse = {
  success: boolean;
  data?: RecruiterJob[];
  error?: {
    message?: string;
  };
};

type DashboardReportResponse = {
  success: boolean;
  data?: {
    metrics: DashboardMetrics;
    departmentStats: DepartmentStat[] | null;
    recruiterStats: RecruiterStat[] | null;
  };
  error?: {
    message?: string;
  };
};


function Dashboard({ role, userName, onLogout }: DashboardProps) {
  const navigate = useNavigate();

  const [selectedMenu, setSelectedMenu] = useState("Tổng quan");

  const [dashboardMetrics, setDashboardMetrics] =
  useState<DashboardMetrics | null>(null);

const [departmentStats, setDepartmentStats] =
  useState<DepartmentStat[] | null>(null);

  const [recruiterStats, setRecruiterStats] =
  useState<RecruiterStat[] | null>(null);

const [dashboardLoading, setDashboardLoading] = useState(false);
const [dashboardError, setDashboardError] = useState("");
const [recruiterJobs, setRecruiterJobs] = useState<RecruiterJob[]>([]);
const [recruiterJobsLoading, setRecruiterJobsLoading] = useState(true);
const [recruiterJobsError, setRecruiterJobsError] = useState("");
const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
const [adminLoading, setAdminLoading] = useState(false);
const [adminError, setAdminError] = useState("");



useEffect(() => {
  if (
     !["HRManager", "Recruiter", "HiringManager"].includes(role) ||
    selectedMenu !== "Tổng quan"
  ) {
    return;
  }
  const controller = new AbortController();

  const loadDashboard = async () => {
    setDashboardLoading(true);
    setDashboardError("");
    setDashboardMetrics(null);
setDepartmentStats(null);
setRecruiterStats(null);


    try {
      const token = sessionStorage.getItem("accessToken");

      if (!token) {
        throw new Error("Không tìm thấy phiên đăng nhập.");
      }

      const API_URL =
        import.meta.env.VITE_ATS_API_URL ||
        "http://localhost:4000";

      const response = await fetch(
        `${API_URL}/api/reports/dashboard`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          signal: controller.signal,
        }
      );

      const result =
        (await response.json()) as DashboardReportResponse;

      const metrics = result.data?.metrics;

      if (
        !response.ok ||
        !result.success ||
        !metrics ||
        !Number.isFinite(metrics.totalJobs) ||
        !Number.isFinite(metrics.totalCandidates)
      ) {
        throw new Error(
          result.error?.message ||
          "Không thể tải số liệu Dashboard."
        );
      }

      if (!controller.signal.aborted) {
        setDashboardMetrics(metrics);
setDepartmentStats(
  Array.isArray(result.data?.departmentStats)
    ? result.data.departmentStats
    : null
);

setRecruiterStats(
  Array.isArray(result.data?.recruiterStats)
    ? result.data.recruiterStats
    : null
);

      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setDashboardError(
          error instanceof Error
            ? error.message
            : "Không thể tải số liệu Dashboard."
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setDashboardLoading(false);
      }
    }
  };

  void loadDashboard();

  return () => controller.abort();
}, [role, selectedMenu]);

useEffect(() => {
  if (
  !["Recruiter", "HiringManager", "Candidate"].includes(role) ||
  selectedMenu !== "Tổng quan"
) {
  return;
}

  const controller = new AbortController();

  const loadRecruiterJobs = async () => {
    setRecruiterJobsLoading(true);
    setRecruiterJobsError("");
    setRecruiterJobs([]);

    try {
      const token = sessionStorage.getItem("accessToken");

      if (!token) {
        throw new Error("Không tìm thấy phiên đăng nhập.");
      }

      const API_URL =
        import.meta.env.VITE_ATS_API_URL ||
        "http://localhost:4000";

      const response = await fetch(`${API_URL}/api/jobs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: controller.signal,
      });

      const result =
        (await response.json()) as RecruiterJobsResponse;

      if (
        !response.ok ||
        !result.success ||
        !Array.isArray(result.data)
      ) {
        throw new Error(
          result.error?.message ||
            "Không thể tải danh sách vị trí tuyển dụng."
        );
      }

      if (!controller.signal.aborted) {
        setRecruiterJobs(result.data);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setRecruiterJobsError(
          error instanceof Error
            ? error.message
            : "Không thể tải danh sách vị trí tuyển dụng."
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setRecruiterJobsLoading(false);
      }
    }
  };

  void loadRecruiterJobs();

  return () => controller.abort();
}, [role, selectedMenu]);

useEffect(() => {
  if (role !== "Admin" || selectedMenu !== "Tổng quan") return;

  const controller = new AbortController();
  const loadAdminOverview = async () => {
    setAdminLoading(true);
    setAdminError("");
    setAdminOverview(null);
    try {
      const token = sessionStorage.getItem("accessToken");
      if (!token) throw new Error("Bạn cần đăng nhập lại để xem thống kê.");
      const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";
      const response = await fetch(`${API_URL}/api/reports/admin-overview`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json()) as AdminOverviewResponse;
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message || "Không thể tải thống kê quản trị.");
      }
      if (!controller.signal.aborted) setAdminOverview(payload.data);
    } catch (error) {
      if (!controller.signal.aborted) {
        setAdminError(error instanceof Error ? error.message : "Không thể tải thống kê quản trị.");
      }
    } finally {
      if (!controller.signal.aborted) setAdminLoading(false);
    }
  };
  void loadAdminOverview();
  return () => controller.abort();
}, [role, selectedMenu]);

  const handleMenuSelect = (label: string) => {
    if (label === "Chức danh & dải lương") {
      navigate("/job-titles");
      return;
    }

    if (label === "Phòng ban & tổ chức") {
      navigate("/departments");
      return;
    }
    if (label === "Trang giới thiệu công ty") {
      navigate("/company-profile");
      return;
    }
    if (label === "Hồ sơ cá nhân") {
      navigate("/profile");
      return;
    }

    if (label === "Yêu cầu tuyển dụng") {
      navigate("/recruitment-requests");
      return;
    }

    setSelectedMenu(label);
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={role}
        userName={userName}
        onLogout={onLogout}
        selectedMenu={selectedMenu}
        onMenuSelect={handleMenuSelect}
      />

      <main className="dashboard-content">
        {selectedMenu === "Quản lý tài khoản" && <AccountManagement />}
{selectedMenu === "Vai trò & quyền" && (
  <RoleAndPermissionManagement />
)}

        {selectedMenu === "Hồ sơ cá nhân" && <UserProfilePage />}

        <div
            className="dashboard-overview"
          style={{
            display:
              selectedMenu === "Quản lý tài khoản" ||
              selectedMenu === "Vai trò & quyền" ||
              selectedMenu === "Hồ sơ cá nhân"
                ? "none"
                : undefined,
          }}
        >
          <header className="dashboard-header">
            <div>
              <h1>Tổng quan</h1>
              <p>Chào mừng {userName}</p>
            </div>
          </header>

          {/* =========================

            VAI TRÒ 0 - CANDIDATE (SCRUM-30 / SCRUM-107)

        ========================== */}

          {role === "Candidate" && (
            <>
              <section className="dashboard-cards">
                <div
                  className="dashboard-card"
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate("/jobs")}
                >
                  <span>{recruiterJobsLoading ? "..." : recruiterJobs.length}</span>
                  <p>Vị trí đang tuyển dụng</p>
                </div>

                <div className="dashboard-card">
                  <span>0</span>
                  <p>Hồ sơ đã ứng tuyển</p>
                </div>

                <div className="dashboard-card">
                  <span>0</span>
                  <p>Lịch phỏng vấn sắp tới</p>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Cơ hội nghề nghiệp đang mở</h2>
                  <a
                    href="/jobs"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate("/jobs");
                    }}
                  >
                    Xem tất cả vị trí &rarr;
                  </a>
                </div>

                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Vị trí tuyển dụng</th>
                      <th>Phòng ban</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recruiterJobsLoading ? (
                      <tr>
                        <td colSpan={4}>Đang tải danh sách việc làm...</td>
                      </tr>
                    ) : recruiterJobsError ? (
                      <tr>
                        <td colSpan={4} role="alert">
                          {recruiterJobsError}
                        </td>
                      </tr>
                    ) : recruiterJobs.length === 0 ? (
                      <tr>
                        <td colSpan={4}>
                          Hiện chưa có vị trí nào đang tuyển. Vui lòng quay lại sau!
                        </td>
                      </tr>
                    ) : (
                      recruiterJobs.slice(0, 6).map((job) => (
                        <tr key={job.id}>
                          <td style={{ fontWeight: 600 }}>{job.title}</td>
                          <td>{job.department?.name || "Chưa xác định"}</td>
                          <td>
                            <span className="status-blue">Đang tuyển</span>
                          </td>
                          <td>
                            <button
                              onClick={() => navigate(`/jobs/${job.id}`)}
                              className="view-button"
                              id={`btn-cand-view-${job.id}`}
                            >
                              Xem chi tiết & Ứng tuyển
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            </>
          )}

          {/* =========================

            VAI TRÒ 1 - RECRUITER

        ========================== */}

          {role === "Recruiter" && (
            <>
                {dashboardError && (
      <p role="alert" style={{ color: "#b91c1c" }}>
        {dashboardError}
      </p>
    )}
              <section className="dashboard-cards">
                <div className="dashboard-card">
                  <span>
  {dashboardLoading ? "..." : (dashboardMetrics?.totalJobs ?? "—")}
</span>

                  <p>Vị trí tuyển dụng</p>
                </div>

                <div className="dashboard-card">
<span>
  {dashboardLoading ? "..." : (dashboardMetrics?.totalCandidates ?? "—")}
</span>
                  <p>Ứng viên</p>
                </div>

                <div className="dashboard-card">
                  <span>
  {dashboardLoading ? "..." : (dashboardMetrics?.totalInterviews ?? "—")}
</span>

                  <p>Lịch phỏng vấn</p>
                </div>
              </section>

             <section className="dashboard-panel">
  <div className="panel-title">
    <h2>Vị trí tuyển dụng gần đây</h2>
  </div>

  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Vị trí</th>
        <th>Phòng ban</th>
        <th>Ứng viên</th>
        <th>Trạng thái</th>
      </tr>
    </thead>

    <tbody>
      {recruiterJobsLoading ? (
        <tr>
          <td colSpan={4}>Đang tải dữ liệu...</td>
        </tr>
      ) : recruiterJobsError ? (
        <tr>
          <td colSpan={4} role="alert">
            {recruiterJobsError}
          </td>
        </tr>
      ) : recruiterJobs.length === 0 ? (
        <tr>
          <td colSpan={4}>
            Chưa có vị trí tuyển dụng được phân công.
          </td>
        </tr>
      ) : (
        recruiterJobs.slice(0, 5).map((job) => (
          <tr key={job.id}>
            <td>{job.title}</td>

            <td>{job.department?.name ?? "Chưa xác định"}</td>

            <td>{job.candidateCount ?? "—"}</td>

            <td>
              <span
                className={
                  job.status === "PUBLISHED"
                    ? "status-blue"
                    : job.status === "CLOSED"
                    ? "status-red"
                    : ""
                }
              >
                {job.status === "PUBLISHED"
                  ? "Đang tuyển"
                  : job.status === "DRAFT"
                  ? "Bản nháp"
                  : job.status === "CLOSED"
                  ? "Đã đóng"
                  : job.status}
              </span>
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</section>
              </>
           )}

          {/* =========================

            VAI TRÒ 2 - HIRING MANAGER

        ========================== */}

          {role === "HiringManager" && (
            <>
              {dashboardError && (
  <p role="alert" style={{ color: "#b91c1c" }}>
    {dashboardError}
  </p>
)}

<section className="dashboard-cards">
  <div className="dashboard-card">
    <span>
      {dashboardLoading
        ? "..."
        : (dashboardMetrics?.totalJobs ?? "—")}
    </span>
    <p>Vị trí phòng ban</p>
  </div>

  <div className="dashboard-card">
    <span>
      {dashboardLoading
        ? "..."
        : (dashboardMetrics?.totalCandidates ?? "—")}
    </span>
    <p>Ứng viên</p>
  </div>

  <div className="dashboard-card">
    <span>
      {dashboardLoading
        ? "..."
        : (dashboardMetrics?.totalInterviews ?? "—")}
    </span>
    <p>Lịch phỏng vấn</p>
  </div>

  <div className="dashboard-card">
    <span>—</span>
    <p>Chờ quyết định</p>
  </div>
</section>

              <section className="dashboard-panel">
  <div className="panel-title">
    <h2>Vị trí tuyển dụng của tôi</h2>
  </div>

  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Vị trí</th>
        <th>Phòng ban</th>
        <th>Ứng viên</th>
        <th>Trạng thái</th>
      </tr>
    </thead>

    <tbody>
      {recruiterJobsLoading ? (
        <tr>
          <td colSpan={4}>Đang tải dữ liệu...</td>
        </tr>
      ) : recruiterJobsError ? (
        <tr>
          <td colSpan={4} role="alert">
            {recruiterJobsError}
          </td>
        </tr>
      ) : recruiterJobs.length === 0 ? (
        <tr>
          <td colSpan={4}>
            Chưa có vị trí tuyển dụng trong phạm vi quản lý.
          </td>
        </tr>
      ) : (
        recruiterJobs.slice(0, 5).map((job) => (
          <tr key={job.id}>
            <td>{job.title}</td>

            <td>
              {job.department?.name ?? "Chưa xác định"}
            </td>

            <td>
              {Number.isInteger(job.candidateCount)
                ? job.candidateCount
                : "—"}
            </td>

            <td>
              <span
                className={
                  job.status === "PUBLISHED"
                    ? "status-blue"
                    : job.status === "CLOSED"
                    ? "status-red"
                    : ""
                }
              >
                {job.status === "PUBLISHED"
                  ? "Đang tuyển"
                  : job.status === "DRAFT"
                  ? "Bản nháp"
                  : job.status === "CLOSED"
                  ? "Đã đóng"
                  : job.status}
              </span>
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
</section>

              <section className="dashboard-panel">
  <div className="panel-title">
    <h2>Quyết định tuyển gần đây</h2>
  </div>

  <p style={{ color: "#64748b" }}>
    Danh sách quyết định tuyển chưa được kết nối với dữ liệu hệ thống.
  </p>
</section>
            </>
          )}

          {/* =========================

            VAI TRÒ 3 - INTERVIEWER

        ========================== */}

          {role === "Interviewer" && (
            <>
              <section className="dashboard-cards">
                <div className="dashboard-card">
                  <span>12</span>

                  <p>Lịch phỏng vấn</p>
                </div>

                <div className="dashboard-card">
                  <span>18</span>

                  <p>Ứng viên được phân công</p>
                </div>

                <div className="dashboard-card">
                  <span>5</span>

                  <p>Chưa đánh giá</p>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Lịch phỏng vấn sắp tới</h2>

                  <a href="#">Xem tất cả</a>
                </div>

                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Thời gian</th>

                      <th>Ứng viên</th>

                      <th>Vị trí</th>

                      <th>Hình thức</th>

                      <th>Thao tác</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>25/09/2026 09:00</td>

                      <td>Nguyễn Văn A</td>

                      <td>Frontend Developer</td>

                      <td>Online</td>

                      <td>
                        <button className="view-button">Xem hồ sơ</button>
                      </td>
                    </tr>

                    <tr>
                      <td>26/09/2026 14:00</td>

                      <td>Trần Thị Mai</td>

                      <td>Nhân viên Marketing</td>

                      <td>Phòng họp 2</td>

                      <td>
                        <button className="view-button">Xem hồ sơ</button>
                      </td>
                    </tr>

                    <tr>
                      <td>27/09/2026 10:00</td>

                      <td>Lê Minh Đức</td>

                      <td>Backend Developer</td>

                      <td>Online</td>

                      <td>
                        <button className="view-button">Xem hồ sơ</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Phiếu đánh giá cần hoàn thành</h2>
                </div>

                <div className="evaluation-list">
                  <div className="evaluation-item">
                    <div>
                      <strong>Nguyễn Văn A</strong>

                      <p>Frontend Developer</p>
                    </div>

                    <button className="evaluate-button">Đánh giá</button>
                  </div>

                  <div className="evaluation-item">
                    <div>
                      <strong>Trần Thị Mai</strong>

                      <p>Nhân viên Marketing</p>
                    </div>

                    <button className="evaluate-button">Đánh giá</button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* =========================

            VAI TRÒ 4 - HR MANAGER

        ========================== */}

          {role === "HRManager" && (
            <>
              <section className="dashboard-cards">
                <div className="dashboard-card">
                  <span>
  {dashboardLoading
    ? "..."
    : dashboardMetrics?.totalJobs ?? "—"}
</span>

                  <p>Vị trí tuyển dụng</p>
                </div>

                <div className="dashboard-card">
                  <span>
  {dashboardLoading
    ? "..."
    : dashboardMetrics?.totalCandidates ?? "—"}
</span>

                  <p>Tổng ứng viên</p>
                </div>

               <div className="dashboard-card">
  <span>
    {dashboardLoading
      ? "..."
      : dashboardMetrics?.totalRecruiters ?? "—"}
  </span>
  <p>Recruiter đang hoạt động</p>
</div>

               <div className="dashboard-card">
  <span className="dashboard-budget-value">
    {dashboardLoading
      ? "..."
      : dashboardMetrics?.approvedBudget != null
        ? `${dashboardMetrics.approvedBudget.toLocaleString("vi-VN")} ₫`
        : "—"}
  </span>
  <p>Ngân sách đã duyệt</p>
</div>

              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Tình trạng tuyển dụng theo phòng ban</h2>

                  <a href="#">Xem chi tiết</a>
                </div>

                {dashboardLoading ? (
  <p>Đang tải thống kê phòng ban...</p>
) : dashboardError ? (
  <p role="alert">
    Không thể tải thống kê phòng ban.
  </p>
) : departmentStats === null ? (
  <p>API chưa trả dữ liệu thống kê phòng ban.</p>
) : departmentStats.length === 0 ? (
  <p>Chưa có phòng ban đang hoạt động.</p>
) : (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Phòng ban</th>
        <th>Vị trí đang tuyển</th>
        <th>Ứng viên</th>
        <th>Hồ sơ có Offer chấp nhận</th>
        <th>Trạng thái</th>
      </tr>
    </thead>

    <tbody>
      {departmentStats.map((department) => (
        <tr key={department.departmentId}>
          <td>{department.departmentName}</td>

          <td>{department.publishedJobs}</td>

          <td>{department.candidateCount}</td>

          <td>{department.acceptedOffers}</td>

          <td>
            <span
              className={
                department.status === "Đang tuyển"
                  ? "status-blue"
                  : "status-orange"
              }
            >
              {department.status}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)}
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Hiệu suất Recruiter</h2>

                  <a href="#">Xem tất cả</a>
                </div>

               {dashboardLoading ? (
  <p>Đang tải hiệu suất Recruiter...</p>
) : dashboardError ? (
  <p role="alert">Không thể tải hiệu suất Recruiter.</p>
) : recruiterStats === null ? (
  <p>API chưa trả dữ liệu hiệu suất Recruiter.</p>
) : recruiterStats.length === 0 ? (
  <p>Chưa có Recruiter đang hoạt động.</p>
) : (
  <table className="dashboard-table">
    <thead>
      <tr>
        <th>Recruiter</th>
        <th>Vị trí phụ trách</th>
        <th>Ứng viên được giao</th>
        <th>Offer đã chấp nhận</th>
      </tr>
    </thead>

    <tbody>
      {recruiterStats.map((recruiter) => (
        <tr key={recruiter.recruiterId}>
          <td>{recruiter.recruiterName}</td>

          <td>{recruiter.assignedJobs}</td>

          <td>{recruiter.candidateCount}</td>

          <td>{recruiter.acceptedOffers}</td>
        </tr>
      ))}
    </tbody>
  </table>
)}

              </section>
            </>
          )}

          {/* =========================

            VAI TRÒ 5 - APPROVER

        ========================== */}

          {role === "Approver" && (

            <>

 {dashboardError && (
               <p role="alert" style={{ color: "#b42318" }}>
                   Không thể cập nhật thống kê: {dashboardError}
                    </p>
                       )}

              <section className="dashboard-cards">
                <div className="dashboard-card">
                  <span>4</span>

                  <p>Yêu cầu chờ duyệt</p>
                </div>

                <div className="dashboard-card">
                  <span>2</span>

                  <p>Offer chờ duyệt</p>
                </div>

                <div className="dashboard-card">
                  <span>12</span>

                  <p>Đã phê duyệt</p>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Danh sách chờ phê duyệt</h2>

                  <a href="#">Xem tất cả</a>
                </div>

                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Loại yêu cầu</th>

                      <th>Vị trí / Ứng viên</th>

                      <th>Phòng ban</th>

                      <th>Ngày gửi</th>

                      <th>Trạng thái</th>

                      <th>Thao tác</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>Yêu cầu tuyển dụng</td>

                      <td>Lập trình viên Frontend</td>

                      <td>Công nghệ</td>

                      <td>25/09/2026</td>

                      <td>
                        <span className="status-orange">Chờ phê duyệt</span>
                      </td>

                      <td>
                        <button className="view-button">Xem</button>
                      </td>
                    </tr>

                    <tr>
                      <td>Yêu cầu tuyển dụng</td>

                      <td>Nhân viên kinh doanh</td>

                      <td>Kinh doanh</td>

                      <td>24/09/2026</td>

                      <td>
                        <span className="status-orange">Chờ phê duyệt</span>
                      </td>

                      <td>
                        <button className="view-button">Xem</button>
                      </td>
                    </tr>

                    <tr>
                      <td>Offer</td>

                      <td>Nguyễn Thị Mai</td>

                      <td>Marketing</td>

                      <td>23/09/2026</td>

                      <td>
                        <span className="status-orange">Chờ phê duyệt</span>
                      </td>

                      <td>
                        <button className="view-button">Xem</button>
                      </td>
                    </tr>

                    <tr>
                      <td>Offer</td>

                      <td>Trần Văn Long</td>

                      <td>Kinh doanh</td>

                      <td>22/09/2026</td>

                      <td>
                        <span className="status-orange">Chờ phê duyệt</span>
                      </td>

                      <td>
                        <button className="view-button">Xem</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Lịch sử phê duyệt gần đây</h2>
                </div>

                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Nội dung</th>

                      <th>Phòng ban</th>

                      <th>Kết quả</th>

                      <th>Thời gian</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr>
                      <td>Backend Developer</td>

                      <td>Công nghệ</td>

                      <td>
                        <span className="status-green">Đã duyệt</span>
                      </td>

                      <td>20/09/2026</td>
                    </tr>

                    <tr>
                      <td>Offer - Lê Minh Anh</td>

                      <td>Nhân sự</td>

                      <td>
                        <span className="status-green">Đã duyệt</span>
                      </td>

                      <td>19/09/2026</td>
                    </tr>

                    <tr>
                      <td>Chuyên viên Marketing</td>

                      <td>Marketing</td>

                      <td>
                        <span className="status-red">Từ chối</span>
                      </td>

                      <td>18/09/2026</td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </>
          )}

          {/* =========================

            VAI TRÒ 6 - ADMIN

        ========================== */}

          {role === "Admin" && (
            <>
              {adminError && <p role="alert" style={{ color: "#b91c1c" }}>{adminError}</p>}
              {adminOverview?.categoryWarning && (
                <p role="alert" style={{ color: "#92400e" }}>{adminOverview.categoryWarning}</p>
              )}
              <section className="dashboard-cards">
                <div className="dashboard-card">
                  <span>{adminLoading ? "..." : (adminOverview?.totalUsers ?? "—")}</span>
                  <p>Tài khoản</p>
                </div>
                <div className="dashboard-card">
                  <span>{adminLoading ? "..." : (adminOverview?.totalRoles ?? "—")}</span>
                  <p>Vai trò hệ thống</p>
                </div>
                <div className="dashboard-card">
                  <span>{adminLoading ? "..." : (adminOverview?.totalCategories ?? "—")}</span>
                  <p>Danh mục dùng chung</p>
                </div>
                <div className="dashboard-card">
                  <span>{adminLoading ? "..." : (adminOverview?.totalAuditLogs ?? "—")}</span>
                  <p>Nhật ký hệ thống</p>
                </div>
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Thống kê tài khoản theo vai trò</h2>
                </div>
                {adminLoading ? <p>Đang tải thống kê...</p> : adminOverview ? (
                  <>
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Vai trò</th>
                          <th>Số tài khoản</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminOverview.roleStats.length === 0 ? (
                          <tr><td colSpan={3}>Chưa có vai trò nào trong hệ thống.</td></tr>
                        ) : adminOverview.roleStats.map((item) => (
                          <tr key={item.role}>
                            <td>{ROLE_NAMES[item.role] ?? item.role}</td>
                            <td>{item.count}</td>
                            <td>
                              <span className="status-green">{item.activeCount} hoạt động</span>
                              {item.count > item.activeCount && ` · ${item.count - item.activeCount} đã khóa`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p style={{ color: "#64748b", fontSize: 13 }}>
                      Một tài khoản có thể mang nhiều vai trò nên tổng theo vai trò có thể lớn hơn tổng số tài khoản.
                    </p>
                  </>
                ) : <p>Chưa tải được thống kê tài khoản.</p>}
              </section>

              <section className="dashboard-panel">
                <div className="panel-title">
                  <h2>Hoạt động hệ thống gần đây</h2>
                </div>
                {adminLoading ? <p>Đang tải nhật ký...</p> : adminOverview ? (
                  <table className="dashboard-table">
                    <thead>
                      <tr>
                        <th>Thời gian</th>
                        <th>Người dùng</th>
                        <th>Hành động</th>
                        <th>Địa chỉ IP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminOverview.recentLogs.length === 0 ? (
                        <tr><td colSpan={4}>Chưa có nhật ký hoạt động.</td></tr>
                      ) : adminOverview.recentLogs.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.createdAt).toLocaleString("vi-VN")}</td>
                          <td>{entry.actorName}</td>
                          <td>{entry.action}</td>
                          <td>{entry.ipAddress ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p>Chưa tải được nhật ký hệ thống.</p>}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
