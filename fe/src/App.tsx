import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import CompetencyFrameworkManagement from "./pages/CompetencyFrameworkManagement";
import InterviewQuestionBank from "./pages/InterviewQuestionBank";
import RecruitmentSharedCategories from "./pages/RecruitmentSharedCategories";

import RecruitmentRequestManagement from "./pages/RecruitmentRequestManagement";
import RequisitionDeadlineMonitor from "./features/sprint3/RequisitionDeadlineMonitor";
import CreateRecruitmentRequest from "./pages/CreateRecruitmentRequest";


import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";

import "./App.css";
import CopyRequisition from "./features/sprint3/CopyRequisition";
import JobPostingDraft from "./features/sprint3/JobPostingDraft";
import JobPostingPublish from "./features/sprint3/JobPostingPublish";
import PublicCareers from "./features/sprint3/PublicCareers"; // S310_PUBLIC_V1
import ApplicationStatusLookup from "./features/sprint3/ApplicationStatusLookup";
import WithdrawApplication from "./features/sprint4/WithdrawApplication";
import ApprovalWorkflowConfig from "./features/sprint3/ApprovalWorkflowConfig";
import Sprint3RouteGuard from "./features/sprint3/Sprint3RouteGuard";
import { REQUISITION_APPROVAL_ROLES } from "./features/sprint3/routeAccess";
import RequisitionApproval from "./features/sprint3/RequisitionApproval";
import RecruitmentAssignment from "./features/sprint3/RecruitmentAssignment";
import CandidateCvParser from "./features/sprint4/CandidateCvParser";
import EmployeeReferral from "./features/sprint4/EmployeeReferral";
import InternalEmployeeRouteGuard from "./features/sprint4/InternalEmployeeRouteGuard";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";
import DepartmentManagement from "./pages/DepartmentManagement";
import JobTitleSalaryManagement from "./pages/JobTitleSalaryManagement";
import UserProfilePage from "./pages/UserProfilePage";
import CompanyProfilePage from "./pages/CompanyProfilePage";

import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";

import {
  ForbiddenPage,
  NotFoundPage,
  ServerErrorPage,
} from "./pages/ErrorPages";
// @ts-expect-error -- BudgetManagement lacks a TypeScript declaration in the existing project.
import BudgetManagement from "./components/BudgetManagementLive";

import type { Role } from "./data/roleMenus";

import {
  consumeSessionExpired,
  clearLocalSession,
  markSessionExpired,
} from "./services/session";

/* =========================================================
   BACKEND
========================================================= */

const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";


/* =========================================================
   KIỂU DỮ LIỆU
========================================================= */

type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};


type LoginData = {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
};


type ApiResponse<T> = {
  success: boolean;

  data?: T;

  error?: {
    code?: string;
    message?: string;
  };
};


/* =========================================================
   ROLE BACKEND -> ROLE FRONTEND
========================================================= */

const roleByCode: Record<string, Role> = {
  CANDIDATE: "Candidate",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "HiringManager",
  INTERVIEWER: "Interviewer",
  HR_MANAGER: "HRManager",
  APPROVER: "Approver",
  ADMIN: "Admin",
};


function resolveRole(
  roles: string[]
): Role {
  const priority = [
    "ADMIN",
    "HR_MANAGER",
    "RECRUITER",
    "HIRING_MANAGER",
    "INTERVIEWER",
    "APPROVER",
    "CANDIDATE",
  ];

  const roleCode =
    priority.find(
      (item) => roles.includes(item)
    ) || "CANDIDATE";

  return (
    roleByCode[roleCode] ||
    "Candidate"
  );
}


/* =========================================================
   SESSION
========================================================= */

function saveSession(
  data: LoginData
) {
  sessionStorage.setItem(
    "accessToken",
    data.accessToken
  );

  sessionStorage.setItem(
    "refreshToken",
    data.refreshToken
  );

  sessionStorage.setItem(
    "atsUser",
    JSON.stringify(data.user)
  );
  // S1-02 - Ghi nhận thời điểm bắt đầu phiên
   sessionStorage.setItem(
  "atsLastActivityAt",
  String(Date.now())
   );
}


function getSessionUser():
  SessionUser | null {

  const raw =
    sessionStorage.getItem(
      "atsUser"
    );

  if (!raw) {
    return null;
  }

  try {
    const user =
      JSON.parse(raw) as SessionUser;

    if (
      !user.id ||
      !user.email ||
      !user.fullName ||
      !Array.isArray(user.roles)
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}


function clearSession() {
  /*
   * Giữ tương thích với
   * services/session hiện tại.
   */
  clearLocalSession();

  sessionStorage.removeItem(
    "accessToken"
  );

  sessionStorage.removeItem(
    "refreshToken"
  );

  sessionStorage.removeItem(
    "atsUser"
  );
}


/* =========================================================
   S1-02 - LOGOUT BACKEND
========================================================= */

async function logoutFromBackend(): Promise<void> {
  const accessToken =
    sessionStorage.getItem("accessToken");

  const refreshToken =
    sessionStorage.getItem("refreshToken");

  if (!accessToken) {
    return;
  }

  let response: Response;

  try {
    response = await fetch(
      `${API_URL}/api/auth/logout`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",

          Authorization:
            `Bearer ${accessToken}`,
        },

        body: JSON.stringify({
          refreshToken,
        }),
      }
    );
  } catch {
    throw new Error(
      "Không thể kết nối đến máy chủ để đăng xuất."
    );
  }

  let result:
    ApiResponse<{
      message?: string;
    }> | null;

  try {
    result =
      (await response.json()) as
        ApiResponse<{
          message?: string;
        }>;
  } catch {
    result = null;
  }

  /*
   * Nếu access token đã bị revoke trước đó
   * thì phía server đã an toàn.
   */
  if (
    response.status === 401 &&
    result?.error?.code ===
      "TOKEN_REVOKED"
  ) {
    return;
  }

  /*
   * Các lỗi logout khác:
   * không xóa session phía frontend.
   */
  if (!response.ok) {
    throw new Error(
      result?.error?.message ||
        "Không thể đăng xuất khỏi máy chủ."
    );
  }
}

/* =========================================================
   LOGIN
========================================================= */
const DEVICE_ID_KEY = "atsDeviceId";

function getOrCreateDeviceId(): string {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);

  if (!deviceId) {
    deviceId =
      `device-${Date.now()}-` +
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);

    localStorage.setItem(
      DEVICE_ID_KEY,
      deviceId
    );
  }

  return deviceId;
}


function Login() {
  const navigate =
    useNavigate();

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  const [sessionExpired] =
    useState(
      () =>
        consumeSessionExpired()
    );


  /*
   * Nếu đã đăng nhập
   * thì không hiện lại Login.
   */
  const currentUser =
    getSessionUser();

  if (currentUser) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }


  /* =======================================================
     ĐĂNG NHẬP
  ======================================================= */

  const handleLogin = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError("");


    if (
      !email.trim() ||
      !password.trim()
    ) {
      setError(
        "Vui lòng nhập đầy đủ email công ty và mật khẩu."
      );

      return;
    }


    setIsSubmitting(true);


    try {

             const response =
        await fetch(
          `${API_URL}/api/auth/login`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email: email.trim(),
              password,
              deviceId:
                getOrCreateDeviceId(),
            }),
          }
        );


      let result:
        ApiResponse<LoginData>;

      try {
        result =
          (await response.json()) as
            ApiResponse<LoginData>;
      } catch {
        throw new Error(
          "Phản hồi từ máy chủ không hợp lệ."
        );
      }


      if (
        !response.ok ||
        !result.success ||
        !result.data
      ) {
        throw new Error(
          result.error?.message ||
            "Email hoặc mật khẩu không chính xác."
        );
      }


      /*
       * Lưu access token,
       * refresh token và user.
       */
      saveSession(
        result.data
      );


      navigate(
        "/dashboard",
        {
          replace: true,
        }
      );
    } catch (loginError) {
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Không thể đăng nhập."
      );
    } finally {
      setIsSubmitting(false);
    }
  };


  /* =======================================================
     GIAO DIỆN ĐĂNG NHẬP
  ======================================================= */

  return (
    <div className="login-page">

      {/* PHẦN BÊN TRÁI */}

      <section className="left-panel">

        <div className="logo">

          <div className="logo-icon">
            A
          </div>

          <div>
            <h2>ATS</h2>

            <p>
              Internal Recruitment
            </p>
          </div>

        </div>


        <div className="left-content">

          <span className="small-title">
            HỆ THỐNG TUYỂN DỤNG NỘI BỘ
          </span>


          <h1>
            Tuyển đúng người.
            <br />
            Theo dõi đúng quy trình.
          </h1>


          <p className="description">
            Quản lý tập trung yêu cầu tuyển dụng,
            ứng viên, phỏng vấn và quyết định
            tuyển dụng trên một hệ thống duy nhất.
          </p>


          <div className="feature-box">

            <div className="feature-icon">
              ✓
            </div>

            <div>
              <h3>
                Phân quyền theo vai trò
              </h3>

              <p>
                Chỉ truy cập đúng dữ liệu
                thuộc phạm vi được cấp.
              </p>
            </div>

          </div>


          <div className="feature-box">

            <div className="feature-icon">
              ◎
            </div>

            <div>
              <h3>
                Quy trình tuyển dụng tập trung
              </h3>

              <p>
                Theo dõi xuyên suốt từ yêu cầu
                tuyển dụng đến nhận việc.
              </p>
            </div>

          </div>

        </div>


        <p className="copyright">
          © 2026 ATS Recruitment System
        </p>

      </section>


      {/* PHẦN ĐĂNG NHẬP */}

      <section className="right-panel">

        <div className="login-card">

          <span className="welcome">
            CHÀO MỪNG TRỞ LẠI
          </span>


          <h2>
            Đăng nhập
          </h2>


          <p className="login-note">
            Sử dụng tài khoản công ty
            để tiếp tục vào hệ thống.
          </p>


          {sessionExpired && (
            <div className="session-message">
              Phiên đăng nhập đã hết hạn.
              Vui lòng đăng nhập lại.
            </div>
          )}


          <form
            onSubmit={handleLogin}
          >

            {/* EMAIL */}

            <div className="form-group">

              <label>
                Email công ty
              </label>


              <div className="input-box">

                <span className="input-icon">
                  ✉
                </span>


                <input
                  id="login-email"
                  type="email"
                  placeholder="tenban@congty.vn"
                  value={email}
                  onChange={(e) =>
                    setEmail(
                      e.target.value
                    )
                  }
                />

              </div>

            </div>


            {/* PASSWORD */}

            <div className="form-group">

              <div className="password-header">

                <label>
                  Mật khẩu
                </label>


                <Link to="/forgot-password">
                  Quên mật khẩu?
                </Link>

              </div>


              <div className="input-box">

                <span className="input-icon">
                  🔒
                </span>


                <input
                  id="login-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) =>
                    setPassword(
                      e.target.value
                    )
                  }
                />


                <button
                  type="button"
                  className="show-password"
                  onClick={() =>
                    setShowPassword(
                      !showPassword
                    )
                  }
                >
                  {showPassword
                    ? "Ẩn"
                    : "Hiện"}
                </button>

              </div>

            </div>


            {error && (
              <div className="error-message">
                {error}
              </div>
            )}


            <button
              type="submit"
              className="login-button"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? "Đang đăng nhập…"
                : "Đăng nhập"}
            </button>

          </form>

          {/* S4-01: Lien ket den cong tuyen dung cong khai. */}
          <Link to="/careers" className="login-careers-link">
            Xem các vị trí đang tuyển <span aria-hidden="true">→</span>
          </Link>

          <p className="support">
            Không đăng nhập được?
            Liên hệ Quản trị hệ thống
            để được hỗ trợ.
          </p>

        </div>

      </section>

    </div>
  );
}


/* =========================================================
   DASHBOARD
========================================================= */

function DashboardRoute() {

  const navigate =
    useNavigate();


  const user =
    getSessionUser();


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }


  const role =
    resolveRole(
      user.roles
    );


  /*
   * S1-02:
   * Chỉ xóa session Frontend
   * SAU KHI Backend logout thành công.
   */
  const handleLogout =
    async () => {

      try {

        await logoutFromBackend();


        /*
         * Backend đã revoke token.
         * Bây giờ mới xóa local session.
         */
        clearSession();


        navigate(
          "/login",
          {
            replace: true,
          }
        );

      } catch (logoutError) {

        console.error(
          "Logout failed:",
          logoutError
        );


        alert(
          logoutError instanceof Error
            ? logoutError.message
            : "Không thể đăng xuất an toàn. Vui lòng thử lại."
        );
      }
    };


  return (
    <Dashboard
      role={role}
      userName={user.fullName}
      onLogout={handleLogout}
    />
  );
}


/* =========================================================
   PROFILE - SPRINT 2
========================================================= */

function ProfileRoute() {

  const navigate =
    useNavigate();


  const user =
    getSessionUser();


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }


  const role =
    resolveRole(
      user.roles
    );


  /*
   * Dùng cùng cơ chế logout
   * an toàn như Dashboard.
   */
  const handleLogout =
    async () => {

      try {

        await logoutFromBackend();

        clearSession();


        navigate(
          "/login",
          {
            replace: true,
          }
        );

      } catch (logoutError) {

        console.error(
          "Logout failed:",
          logoutError
        );


        alert(
          logoutError instanceof Error
            ? logoutError.message
            : "Không thể đăng xuất an toàn. Vui lòng thử lại."
        );
      }
    };


  const handleMenuSelect = (
    label: string
  ) => {

    if (
      label === "Tổng quan"
    ) {
      navigate(
        "/dashboard"
      );

      return;
    }


    if (
      label ===
      "Phòng ban & tổ chức"
    ) {
      navigate(
        "/departments"
      );

      return;
    }


    if (
      label ===
      "Chức danh & dải lương"
    ) {
      navigate(
        "/job-titles"
      );

      return;
    }


    if (
      label ===
      "Hồ sơ cá nhân"
    ) {
      navigate(
        "/profile"
      );

      return;
    }
  };


  return (
    <div className="dashboard-layout">

      <Sidebar
        role={role}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Hồ sơ cá nhân"
        onMenuSelect={
          handleMenuSelect
        }
      />


      <main className="dashboard-content">

        <UserProfilePage />

      </main>

    </div>
  );
}


/* =========================================================
   DEPARTMENT - SPRINT 2
========================================================= */

function DepartmentRoute() {

  const user =
    getSessionUser();


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }


  const role =
    resolveRole(
      user.roles
    );


  return (
    <DepartmentManagement
      role={role}
      userName={user.fullName}
    />
  );
}


/* =========================================================
   JOB TITLE - SPRINT 2
========================================================= */

function JobTitleRoute() {

  const user =
    getSessionUser();


  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }


  const role =
    resolveRole(
      user.roles
    );


  return (
    <JobTitleSalaryManagement
      role={role}
      userName={user.fullName}
    />
  );
}

/* =========================================================
   COMPETENCY FRAMEWORK - S2-06
========================================================= */

function CompetencyFrameworkRoute() {
  const user = getSessionUser();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const role = resolveRole(user.roles);

  /*
   * S2-06:
   * Actor trong backlog là
   * Trưởng phòng Nhân sự.
   */
  if (role !== "HRManager") {
    return (
      <Navigate
        to="/403"
        replace
      />
    );
  }

  return (
    <CompetencyFrameworkManagement
      role={role}
      userName={user.fullName}
    />
  );
}

function InterviewQuestionBankRoute() {
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = resolveRole(user.roles);

  if (role !== "HRManager") {
    return <Navigate to="/403" replace />;
  }

  return (
    <InterviewQuestionBank
      role={role}
      userName={user.fullName}
    />
  );
}

function RecruitmentSharedCategoriesRoute() {
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = resolveRole(user.roles);

  if (role !== "HRManager") {
    return <Navigate to="/403" replace />;
  }

  return (
    <RecruitmentSharedCategories
      role={role}
      userName={user.fullName}
    />
  );
}

function S308RequisitionMonitorRoute() {
  const navigate = useNavigate();
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;
  const role = resolveRole(user.roles);
  if (role !== "HRManager") return <Navigate to="/403" replace />;
  const logout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Đăng xuất thất bại.");
    }
  };
  return (
    <div className="dashboard-layout">
      <Sidebar role={role} userName={user.fullName} onLogout={logout}
        selectedMenu="Yêu cầu tuyển dụng" onMenuSelect={() => navigate("/dashboard")} />
      <main className="dashboard-content"><RequisitionDeadlineMonitor /></main>
    </div>
  );
}

function RecruitmentRequestRoute() {
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const role = resolveRole(user.roles);

  return (
    <RecruitmentRequestManagement
      role={role}
      userName={user.fullName}
    />
  );
}


/* =========================================================
   ROOT
========================================================= */

function RootRoute() {

  const user =
    getSessionUser();


  return (
    <Navigate
      to={
        user
          ? "/dashboard"
          : "/login"
      }
      replace
    />
  );
}

function RecruitmentRequestCreateRoute() {
  const navigate = useNavigate();
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;
  const role = resolveRole(user.roles);
  if (!["HiringManager", "Recruiter", "HRManager", "Admin"].includes(role)) {
    return <Navigate to="/403" replace />;
  }
  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert(error instanceof Error ? error.message : "Không thể đăng xuất. Vui lòng thử lại.");
    }
  };
  return (
    <div className="dashboard-layout">
      <Sidebar
        role={role}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Yêu cầu tuyển dụng"
        onMenuSelect={() => navigate("/dashboard")}
      />
      <main className="dashboard-content">
        <CreateRecruitmentRequest />
      </main>
    </div>
  );
}

function CompanyProfileRoute() {
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;
  const role = resolveRole(user.roles);
  if (role !== "HRManager" && role !== "Admin") return <Navigate to="/403" replace />;
  const handleLogout = async () => {
    await logoutFromBackend();
    clearSession();
    window.location.assign("/login");
  };
  return <CompanyProfilePage role={role} userName={user.fullName} onLogout={handleLogout} />;
}

/* =========================================================
   APP
========================================================= */
const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

function SessionIdleWatcher() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const accessToken =
      sessionStorage.getItem("accessToken");

    /*
     * Chưa đăng nhập thì không chạy bộ đếm.
     */
    if (!accessToken) {
      return;
    }

    let timerId:
      ReturnType<typeof setTimeout>;
      const savedActivityAt = Number(
  sessionStorage.getItem("atsLastActivityAt")
);

let lastActivityAt =
  Number.isFinite(savedActivityAt) && savedActivityAt > 0
    ? savedActivityAt
    : Date.now();

      let lastActivitySentAt = 0;
      let activitySending = false;
      let sessionExpiring = false;
      let isRefreshing = false;
      let disposed = false;

    const expireSession = async () => {

if (disposed || sessionExpiring) {
  return;
}

sessionExpiring = true;

      /*
       * Cố gắng vô hiệu hóa phiên phía Backend.
       * Nếu Backend lỗi thì vẫn phải logout
       * phía Frontend vì người dùng đã idle quá 10 giây.
       */
      try {
        await logoutFromBackend();
      } catch (error) {
        console.error(
          "Idle logout failed:",
          error
        );
      }

      /*
       * clearSession() sẽ xóa:
       * accessToken
       * refreshToken
       * atsUser
       */
      clearSession();

       sessionStorage.removeItem("atsLastActivityAt");

      /*
       * Phải đánh dấu SAU clearSession(),
       * vì clearLocalSession() bên trong clearSession()
       * cũng xóa sessionExpired.
       */
      markSessionExpired();

      navigate(
        "/login",
        {
          replace: true,
        }
      );
    };

// S1-02 - Gửi hoạt động thực tế đến Backend
const sendActivityToBackend = async () => {
  if (disposed || activitySending || sessionExpiring) {
    return;
  }

  const token = sessionStorage.getItem("accessToken");
  const refreshTokenAtStart =
    sessionStorage.getItem("refreshToken");

  if (!token || !refreshTokenAtStart) {
    return;
  }

  activitySending = true;

  try {
    const response = await fetch(
      `${API_URL}/api/auth/activity`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (response.status === 401) {
      // Chỉ xử lý nếu vẫn là phiên ban đầu.
      if (
        !disposed &&
        !sessionExpiring &&
        sessionStorage.getItem("refreshToken") ===
          refreshTokenAtStart
      ) {
        sessionExpiring = true;
        clearSession();
        sessionStorage.removeItem("atsLastActivityAt");
        markSessionExpired();
        navigate("/login", { replace: true });
      }

      return;
    }

    if (!response.ok) {
      console.error(
        "Không thể ghi nhận hoạt động:",
        response.status
      );
    }
  } catch (error) {
    console.error(
      "Lỗi kết nối API hoạt động:",
      error
    );
  } finally {
    activitySending = false;
  }
};

// S1-02 - Đếm thời gian còn lại,
// không tự đặt lại khi chuyển trang
const scheduleIdleTimer = () => {
  clearTimeout(timerId);

  const remainingMs =
    IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt);

  if (remainingMs <= 0) {
    void expireSession();
    return;
  }

  timerId = setTimeout(() => {
    void expireSession();
  }, remainingMs);
};

    const resetTimer = () => {
  if (disposed || sessionExpiring) {
    return;
  }

  const currentTime = Date.now();

  // Nếu đã không hoạt động đủ 20 phút,
  // không cho thao tác mới khôi phục phiên cũ.
  if (
    currentTime - lastActivityAt >= IDLE_TIMEOUT_MS
  ) {
    void expireSession();
    return;
  }

  // Ghi nhận hoạt động người dùng
  lastActivityAt = currentTime;

  sessionStorage.setItem(
    "atsLastActivityAt",
    String(lastActivityAt)
  );

  // Đếm lại 20 phút ở Frontend
  scheduleIdleTimer();

  // Giới hạn yêu cầu API: tối đa khoảng
  // một lần mỗi 15 giây khi có hoạt động.
  if (
    currentTime - lastActivitySentAt >= 15 * 1000
  ) {
    lastActivitySentAt = currentTime;
    void sendActivityToBackend();
  }
};


    const activityEvents = [
      "mousemove",
      "mousedown",
      "keydown",
      "click",
      "scroll",
      "touchstart",
    ];

    activityEvents.forEach(
      (eventName) => {
        window.addEventListener(
          eventName,
          resetTimer
        );
      }
    );

    /*
     * Bắt đầu đếm 20 phút ngay
     * sau khi vào phiên đăng nhập.
     */
    scheduleIdleTimer();

const refreshAccessTokenIfNeeded = async () => {
  if (disposed || isRefreshing) {
    return;
  }

  // Không gia hạn khi đã không hoạt động 20 phút.
  if (Date.now() - lastActivityAt >= IDLE_TIMEOUT_MS) {
    return;
  }

  const accessToken =
    sessionStorage.getItem("accessToken");

  const refreshToken =
    sessionStorage.getItem("refreshToken");

  if (!accessToken || !refreshToken) {
    return;
  }

  try {
    const tokenPart = accessToken.split(".")[1];

    if (!tokenPart) {
      return;
    }

    const payload = JSON.parse(
      atob(
        tokenPart
          .replace(/-/g, "+")
          .replace(/_/g, "/")
      )
    ) as { exp?: number };

    if (typeof payload.exp !== "number") {
      return;
    }

    // Chỉ gia hạn khi token còn tối đa 10 phút.
    const remainingMs = payload.exp * 1000 - Date.now();

    if (remainingMs > 10 * 60 * 1000) {
      return;
    }

    isRefreshing = true;

    const response = await fetch(
      `${API_URL}/api/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      }
    );

    if (response.status === 401) {
      if (!disposed) {
        clearSession();
        markSessionExpired();
        navigate("/login", { replace: true });
      }
      return;
    }

    if (!response.ok) {
      throw new Error("Không thể gia hạn phiên.");
    }

    const result = (await response.json()) as
      ApiResponse<{ accessToken: string }>;

    if (!result.success || !result.data?.accessToken) {
      throw new Error("Phản hồi gia hạn không hợp lệ.");
    }

    // Không khôi phục token sau khi người dùng đăng xuất.
    if (
      !disposed &&
      sessionStorage.getItem("refreshToken") === refreshToken &&
      Date.now() - lastActivityAt < IDLE_TIMEOUT_MS
    ) {
      sessionStorage.setItem(
        "accessToken",
        result.data.accessToken
      );
    }
  } catch (error) {
    console.error("Gia hạn phiên thất bại:", error);
  } finally {
    isRefreshing = false;
  }
};

// Kiểm tra thời hạn token mỗi phút.
const refreshCheckId = window.setInterval(() => {
  void refreshAccessTokenIfNeeded();
}, 60 * 1000);

// Kiểm tra ngay khi bộ theo dõi được khởi tạo.
void refreshAccessTokenIfNeeded();

   return () => {
  disposed = true;

  clearTimeout(timerId);
  window.clearInterval(refreshCheckId);

  activityEvents.forEach(
    (eventName) => {
      window.removeEventListener(
        eventName,
        resetTimer
      );
    }
  );
};


  }, [
    navigate,
    location.pathname,
  ]);

  return null;
}


/* SCRUM-36: Su dung chung sidebar cua ATS, giu co che phan quyen route. */
function Sprint3ApprovalWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Khong the dang xuat an toan. Vui long thu lai."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Luồng phê duyệt"
        onMenuSelect={() => navigate("/dashboard")}
      />
      <main className="dashboard-content">
        <ApprovalWorkflowConfig />
      </main>
    </div>
  );
}


/* SCRUM-40 / S3-05: use the existing ATS sidebar; HIRING_MANAGER only via route guard. */
function Sprint3CopyWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert(error instanceof Error ? error.message : "Không thể đăng xuất. Vui lòng thử lại.");
    }
  };
  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Yêu cầu tuyển dụng"
        onMenuSelect={() => navigate("/dashboard")}
      />
      <div className="dashboard-content"><CopyRequisition /></div>
    </div>
  );
}


/* SCRUM-44 / S3-09: Frontend soan tin tuyen dung */
function Sprint3PostingWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể đăng xuất. Vui lòng thử lại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Soạn tin tuyển dụng"
        onMenuSelect={() => navigate("/dashboard")}
      />
      <main className="dashboard-content">
        <JobPostingDraft />
      </main>
    </div>
  );
}

/* S3-02 FE: Giao diện duyệt / từ chối yêu cầu tuyển dụng */
function Sprint3RequisitionApprovalWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);

      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể đăng xuất. Vui lòng thử lại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Yêu cầu tuyển dụng"
        onMenuSelect={() => navigate("/dashboard")}
      />

      <main className="dashboard-content">
        <RequisitionApproval />
      </main>
    </div>
  );
}

/* S3-06 FE: Giao diện phân công tuyển dụng */
function Sprint3RecruitmentAssignmentWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);

      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể đăng xuất. Vui lòng thử lại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Phân công recruiter"
        onMenuSelect={() => navigate("/dashboard")}
      />

      <main className="dashboard-content">
        <RecruitmentAssignment />
      </main>
    </div>
  );
}
/* S3-10 FE: Giao diện duyệt và xuất bản tin tuyển dụng */
function Sprint3JobPostingPublishWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout failed:", error);

      window.alert(
        error instanceof Error
          ? error.message
          : "Không thể đăng xuất. Vui lòng thử lại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Duyệt & xuất bản tin"
        onMenuSelect={() => navigate("/dashboard")}
      />

      <main className="dashboard-content">
        <JobPostingPublish />
      </main>
    </div>
  );
}

function Sprint3BudgetWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) return <Navigate to="/login" replace />;

  if (!user.roles.some((role) =>
    ["ADMIN", "HR_MANAGER", "RECRUITER"].includes(role)
  )) {
    return <Navigate to="/403" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Đăng xuất thất bại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Ngân sách & chỉ tiêu"
        onMenuSelect={() => navigate("/dashboard")}
      />
      <main className="dashboard-content">
        <BudgetManagement />
      </main>
    </div>
  );
}

/* S4-04 FE: Recruiter bóc tách thông tin ứng viên từ CV PDF */
function Sprint4CandidateCvParserWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Đăng xuất thất bại."
      );
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={resolveRole(user.roles)}
        userName={user.fullName}
        onLogout={handleLogout}
        selectedMenu="Ứng viên"
        onMenuSelect={() => navigate("/dashboard")}
      />

      <main className="dashboard-content">
        <CandidateCvParser />
      </main>
    </div>
  );
}

// S4-07: Nhân viên nội bộ giới thiệu ứng viên.
function Sprint4EmployeeReferralWithSidebar() {
  const navigate = useNavigate();
  const user = getSessionUser();
  if (!user) return <Navigate to="/login" replace />;
  const handleLogout = async () => {
    try {
      await logoutFromBackend();
      clearSession();
      navigate("/login", { replace: true });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Đăng xuất thất bại.");
    }
  };
  return (
    <div className="dashboard-layout">
      <Sidebar role={resolveRole(user.roles)} userName={user.fullName}
        onLogout={handleLogout} selectedMenu="Giới thiệu ứng viên"
        onMenuSelect={() => navigate("/dashboard")} />
      <main className="dashboard-content"><EmployeeReferral /></main>
    </div>
  );
}

function App() {

  return (
    <BrowserRouter>

      <SessionIdleWatcher />

      <Routes>
        {/* Public published jobs: no login required */}
        <Route path="/withdraw-application" element={<WithdrawApplication />} />
        <Route path="/careers/tra-cuu" element={<ApplicationStatusLookup />} />
        <Route path="/careers" element={<PublicCareers />} />
        <Route path="/careers/:id" element={<PublicCareers />} />
        {/* ROOT */}


        <Route
          path="/"
          element={
            <RootRoute />
          }
        />


        {/* AUTH */}

        <Route
          path="/login"
          element={
            <Login />
          }
        />


        <Route
          path="/forgot-password"
          element={
            <ForgotPassword />
          }
        />


        <Route
          path="/reset-password"
          element={
            <ResetPassword />
          }
        />


        <Route
          path="/change-password"
          element={
            <ChangePassword />
          }
        />


        {/* DASHBOARD */}

        <Route
          path="/dashboard"
          element={
            <DashboardRoute />
          }
        />
        <Route path="/budget-management" element={<Sprint3BudgetWithSidebar />} />


        {/* SPRINT 2 */}

        <Route
          path="/departments"
          element={
            <DepartmentRoute />
          }
        />


        <Route
          path="/job-titles"
          element={
            <JobTitleRoute />
          }
        />

         <Route
           path="/competency-frameworks"
           element={
              <CompetencyFrameworkRoute />
       }
/>
          <Route
            path="/interview-question-bank"
            element={
            <InterviewQuestionBankRoute />
            }
/>
        <Route path="/company-profile" element={<CompanyProfileRoute />} />

<Route
  path="/recruitment-shared-categories"
  element={<RecruitmentSharedCategoriesRoute />}
/>

        <Route path="/recruitment-requests/monitoring" element={<S308RequisitionMonitorRoute />} />
        <Route
          path="/recruitment-requests"
          element={<RecruitmentRequestRoute />}
        />

        <Route
          path="/profile"
          element={
            <ProfileRoute />
          }
        />


        {/* ERROR */}

        <Route
          path="/403"
          element={
            <ForbiddenPage />
          }
        />


        <Route
          path="/404"
          element={
            <NotFoundPage />
          }
        />
        <Route
          path="/recruitment-requests/copy"
          element={<Sprint3RouteGuard allowedRole="HIRING_MANAGER"><Sprint3CopyWithSidebar /></Sprint3RouteGuard>}
        />

        <Route
          path="/job-postings/draft"
          element={
            <Sprint3RouteGuard allowedRole="RECRUITER">
              <Sprint3PostingWithSidebar />
            </Sprint3RouteGuard>
          }
        />

        <Route
          path="/recruitment-requests/create"
          element={<RecruitmentRequestCreateRoute />}
        />


        <Route
          path="/500"
          element={
            <ServerErrorPage />
          }
        />


        <Route
          path="/requisition-approvals"
          element={
            <Sprint3RouteGuard allowedRole={REQUISITION_APPROVAL_ROLES}>
              <Sprint3RequisitionApprovalWithSidebar />
            </Sprint3RouteGuard>
          }
        />
        <Route
          path="/recruitment-assignments"
          element={
            <Sprint3RouteGuard allowedRole="HR_MANAGER">
              <Sprint3RecruitmentAssignmentWithSidebar />
            </Sprint3RouteGuard>
          }
        />
        <Route
          path="/job-postings/publish"
          element={
            <Sprint3RouteGuard allowedRole="HR_MANAGER">
              <Sprint3JobPostingPublishWithSidebar />
            </Sprint3RouteGuard>
          }
        />
        {/* S4-04: Recruiter bóc tách thông tin ứng viên từ CV PDF */}
        <Route
          path="/candidates"
          element={
            <Sprint3RouteGuard allowedRole="RECRUITER">
              <Sprint4CandidateCvParserWithSidebar />
            </Sprint3RouteGuard>
          }
        />
        <Route
          path="/candidates/cv-parser"
          element={
            <Sprint3RouteGuard allowedRole="RECRUITER">
              <Sprint4CandidateCvParserWithSidebar />
            </Sprint3RouteGuard>
          }
        />
        <Route
          path="/employee-referrals"
          element={<InternalEmployeeRouteGuard><Sprint4EmployeeReferralWithSidebar /></InternalEmployeeRouteGuard>}
        />
        <Route
          path="*"
          element={
            <NotFoundPage />
          }
        />


        <Route path="/approval-workflows" element={<Sprint3RouteGuard allowedRole="HR_MANAGER"><Sprint3ApprovalWithSidebar /></Sprint3RouteGuard>} />
      </Routes>

    </BrowserRouter>
  );
}


export default App;
