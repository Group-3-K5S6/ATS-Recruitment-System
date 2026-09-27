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
import ChangePassword from "./pages/ChangePassword";
import {
  ForbiddenPage,
  NotFoundPage,
  ServerErrorPage,
} from "./pages/ErrorPages";

import Dashboard from "./components/Dashboard";
import { login, logout } from "./services/roleApi";


import type { Role } from "./data/roleMenus";

import {
  consumeSessionExpired,
  clearLocalSession,
  getLocalSession,
  saveLocalSession,
} from "./services/session";

const roleByCode: Record<string, Role> = {
  CANDIDATE: "Candidate",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "HiringManager",
  INTERVIEWER: "Interviewer",
  HR_MANAGER: "HRManager",
  APPROVER: "Approver",
  ADMIN: "Admin",
};

function resolveRole(roles: string[]): Role {
  const priority = ["ADMIN", "HR_MANAGER", "RECRUITER", "HIRING_MANAGER", "INTERVIEWER", "APPROVER", "CANDIDATE"];
  const roleCode = priority.find((role) => roles.includes(role));
  return roleByCode[roleCode || "CANDIDATE"];
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);

  // S1-02:
  // Kiểm tra xem phiên trước đó có bị hết hạn hay không
  const [sessionExpired] = useState(() =>
    consumeSessionExpired()
  );

  const handleLogin = async (
    e: FormEvent<HTMLFormElement>
  ) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password.trim()) {
      setError(
        "Vui lòng nhập đầy đủ email công ty và mật khẩu."
      );

      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email.trim(), password);
      saveLocalSession(result.accessToken, result.refreshToken, result.user);
      navigate("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Không thể đăng nhập.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==============================
  // TRANG ĐĂNG NHẬP
  // ==============================

  return (
    <div className="login-page">

      {/* ======================
          PHẦN BÊN TRÁI
      ====================== */}

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
                Chỉ truy cập đúng dữ liệu thuộc
                phạm vi được cấp.
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

      {/* ======================
          PHẦN ĐĂNG NHẬP
      ====================== */}

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

          {/* ======================
              S1-02:
              THÔNG BÁO HẾT PHIÊN
          ====================== */}

          {sessionExpired && (
            <div className="session-message">
              Phiên đăng nhập đã hết hạn.
              Vui lòng đăng nhập lại.
            </div>
          )}

          <form onSubmit={handleLogin}>

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
                    setEmail(e.target.value)
                  }
                />

              </div>

            </div>

            {/* MẬT KHẨU */}

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

            {/* THÔNG BÁO LỖI */}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* NÚT ĐĂNG NHẬP */}

            <button
              type="submit"
              className="login-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
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

function DashboardRoute() {
  const [session, setSession] = useState(() => getLocalSession());
  const handleLogout = async () => {
    const token = sessionStorage.getItem("accessToken");
    if (token) await logout(token).catch(() => undefined);
    clearLocalSession();
    setSession(null);
  };

  if (!session) return <Navigate to="/login" replace />;

  return (
    <Dashboard
      role={resolveRole(session.roles || [])}
      userName={session.fullName}
      onLogout={handleLogout}
    />
  );
}

// ====================================
// ROUTER
// ====================================

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />

        <Route
          path="/login"
          element={<Login />}
        />

        <Route
          path="/dashboard"
          element={<DashboardRoute />}
        />

        <Route
          path="/forgot-password"
          element={<ForgotPassword />}
        />

        <Route
          path="/reset-password"
          element={<ResetPassword />}
        />

        <Route
          path="/change-password"
          element={<ChangePassword />}
        />

        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="/500" element={<ServerErrorPage />} />

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
