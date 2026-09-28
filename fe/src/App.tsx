import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  Link,
} from "react-router-dom";

import "./App.css";

import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ChangePassword from "./pages/ChangePassword";

import Dashboard from "./components/Dashboard";


import type { Role } from "./data/roleMenus";

import {
  consumeSessionExpired,
  clearLocalSession,
  markSessionExpired,
} from "./services/session";
import { apiRequest, getCurrentUser, login as loginApi, restoreCurrentUser } from "./services/api";

const roleMap: Record<string, Role> = {
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "HiringManager",
  INTERVIEWER: "Interviewer",
  HR_MANAGER: "HRManager",
  APPROVER: "Approver",
  ADMIN: "Admin",
};

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [currentUser, setCurrentUser] = useState(() => getCurrentUser());
  const [loggedIn, setLoggedIn] = useState(() => Boolean(getCurrentUser()));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // S1-02:
  // Kiểm tra xem phiên trước đó có bị hết hạn hay không
  const [sessionExpired, setSessionExpired] = useState(() =>
    consumeSessionExpired()
  );

  const role = currentUser?.roles.map((value) => roleMap[value]).find(Boolean);

  useEffect(() => {
    const onExpired = () => {
      markSessionExpired();
      setSessionExpired(true);
      setCurrentUser(null);
      setLoggedIn(false);
    };
    window.addEventListener("ats:session-expired", onExpired);
    return () => window.removeEventListener("ats:session-expired", onExpired);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let active = true;
    restoreCurrentUser().then((user) => {
      if (!active) return;
      setCurrentUser(user);
      if (!user.roles.some((value) => roleMap[value])) {
        clearLocalSession();
        setCurrentUser(null);
        setLoggedIn(false);
      }
    }).catch(() => {
      if (active) {
        setCurrentUser(null);
        setLoggedIn(false);
      }
    });
    return () => { active = false; };
  // Validate the saved login once when the app loads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const user = await loginApi(email.trim(), password);
      const userRole = user.roles.map((value) => roleMap[value]).find(Boolean);
      if (!userRole) {
        clearLocalSession();
        throw new Error("Tài khoản này chưa có vai trò sử dụng giao diện nhân sự nội bộ.");
      }
      setCurrentUser(user);
      setLoggedIn(true);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Đăng nhập thất bại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==============================
  // S1-02 - ĐĂNG XUẤT
  // ==============================

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: sessionStorage.getItem("refreshToken") }) });
    } catch { /* Clear local credentials even when the server is unavailable. */ }

    clearLocalSession();

    setLoggedIn(false);
    setCurrentUser(null);

    setEmail("");
    setPassword("");
    setError("");
  };

  // ==============================
  // SAU KHI ĐĂNG NHẬP
  // ==============================

  if (loggedIn) {
  if (!role || !currentUser) return null;
  return (
    <Dashboard
      role={role}
      userName={currentUser.fullName}
      onLogout={handleLogout}
    />
  );
}
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
              {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
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

        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
            />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;
