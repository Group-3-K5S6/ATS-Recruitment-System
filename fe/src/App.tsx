import { useState } from "react";
import type { FormEvent } from "react";

import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
  useNavigate,
} from "react-router-dom";

import "./App.css";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ActivateAccount from "./pages/ActivateAccount";
import ChangePassword from "./pages/ChangePassword";
import DepartmentManagement from "./pages/DepartmentManagement";
import JobTitleSalaryManagement from "./pages/JobTitleSalaryManagement";
import UserProfilePage from "./pages/UserProfilePage";

import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";

import {
  ForbiddenPage,
  NotFoundPage,
  ServerErrorPage,
} from "./pages/ErrorPages";

import type { Role } from "./data/roleMenus";

import {
  consumeSessionExpired,
  clearLocalSession,
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
  user: SessionUser & { mustChangePassword?: boolean };
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
    }> | null = null;

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
              email:
                email.trim(),

              password,
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
        result.data.user.mustChangePassword ? "/change-password" : "/dashboard",
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


/* =========================================================
   APP
========================================================= */

function App() {

  return (
    <BrowserRouter>

      <Routes>

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

        <Route path="/activate-account" element={<ActivateAccount />} />


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
          path="/500"
          element={
            <ServerErrorPage />
          }
        />


        <Route
          path="*"
          element={
            <NotFoundPage />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}


export default App;
