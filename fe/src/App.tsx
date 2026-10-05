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
import DepartmentManagement from "./pages/DepartmentManagement";
import JobTitleSalaryManagement from "./pages/JobTitleSalaryManagement";
import UserProfilePage from "./pages/UserProfilePage";

import Sidebar from "./components/Sidebar";

import {
  ForbiddenPage,
  NotFoundPage,
  ServerErrorPage,
} from "./pages/ErrorPages";

import Dashboard from "./components/Dashboard";

import type { Role } from "./data/roleMenus";

import { consumeSessionExpired, clearLocalSession } from "./services/session";

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

const ROLE_MAP: Record<string, Role> = {
  CANDIDATE: "Candidate",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "HiringManager",
  INTERVIEWER: "Interviewer",
  HR_MANAGER: "HRManager",
  APPROVER: "Approver",
  ADMIN: "Admin",
};

type LoginResponse = {
  success: boolean;
  data?: {
    accessToken: string;
    refreshToken: string;
    user: { fullName: string; roles: string[] };
  };
  error?: { message?: string };
};

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState("HR Manager User");

  // S1-02:
  // Kiểm tra xem phiên trước đó có bị hết hạn hay không
  const [sessionExpired] = useState(() => consumeSessionExpired());

  // Tạm thời test vai trò Admin
  const [role, setRole] = useState<Role>("HRManager");

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ email công ty và mật khẩu.");

      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = (await response.json()) as LoginResponse;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "Đăng nhập không thành công.");
      }

      sessionStorage.setItem("accessToken", result.data.accessToken);
      sessionStorage.setItem("refreshToken", result.data.refreshToken);
      setUserName(result.data.user.fullName);
      const userRole = result.data.user.roles
        .map((item) => ROLE_MAP[item])
        .find((item): item is Role => Boolean(item));
      if (!userRole) throw new Error("Tài khoản chưa được gán vai trò hợp lệ.");
      setRole(userRole);
      setLoggedIn(true);
    } catch (loginError) {
      clearLocalSession();
      setError(
        loginError instanceof Error
          ? loginError.message
          : "Không thể kết nối máy chủ đăng nhập.",
      );
    }
  };

  // ==============================
  // S1-02 - ĐĂNG XUẤT
  // ==============================

  const handleLogout = async () => {
    /*
      Khi Backend S1-02 hoàn thành:

      FE sẽ gọi API logout tại đây.

      Backend phải:
      - làm mất hiệu lực phiên
      - thu hồi refresh token
      - không cho token cũ tiếp tục sử dụng

      Hiện tại mới làm phần Frontend.
    */

    clearLocalSession();

    setLoggedIn(false);

    setEmail("");
    setPassword("");
    setError("");
  };

  // ==============================
  // SAU KHI ĐĂNG NHẬP
  // ==============================

  if (loggedIn) {
    return (
      <Dashboard role={role} userName={userName} onLogout={handleLogout} />
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
          <div className="logo-icon">A</div>

          <div>
            <h2>ATS</h2>

            <p>Internal Recruitment</p>
          </div>
        </div>

        <div className="left-content">
          <span className="small-title">HỆ THỐNG TUYỂN DỤNG NỘI BỘ</span>

          <h1>
            Tuyển đúng người.
            <br />
            Theo dõi đúng quy trình.
          </h1>

          <p className="description">
            Quản lý tập trung yêu cầu tuyển dụng, ứng viên, phỏng vấn và quyết
            định tuyển dụng trên một hệ thống duy nhất.
          </p>

          <div className="feature-box">
            <div className="feature-icon">✓</div>

            <div>
              <h3>Phân quyền theo vai trò</h3>

              <p>Chỉ truy cập đúng dữ liệu thuộc phạm vi được cấp.</p>
            </div>
          </div>

          <div className="feature-box">
            <div className="feature-icon">◎</div>

            <div>
              <h3>Quy trình tuyển dụng tập trung</h3>

              <p>Theo dõi xuyên suốt từ yêu cầu tuyển dụng đến nhận việc.</p>
            </div>
          </div>
        </div>

        <p className="copyright">© 2026 ATS Recruitment System</p>
      </section>

      {/* ======================
          PHẦN ĐĂNG NHẬP
      ====================== */}

      <section className="right-panel">
        <div className="login-card">
          <span className="welcome">CHÀO MỪNG TRỞ LẠI</span>

          <h2>Đăng nhập</h2>

          <p className="login-note">
            Sử dụng tài khoản công ty để tiếp tục vào hệ thống.
          </p>

          {/* ======================
              S1-02:
              THÔNG BÁO HẾT PHIÊN
          ====================== */}

          {sessionExpired && (
            <div className="session-message">
              Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.
            </div>
          )}

          <form onSubmit={handleLogin}>
            {/* EMAIL */}

            <div className="form-group">
              <label>Email công ty</label>

              <div className="input-box">
                <span className="input-icon">✉</span>

                <input
                  type="email"
                  placeholder="tenban@congty.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* MẬT KHẨU */}

            <div className="form-group">
              <div className="password-header">
                <label>Mật khẩu</label>

                <Link to="/forgot-password">Quên mật khẩu?</Link>
              </div>

              <div className="input-box">
                <span className="input-icon">🔒</span>

                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="button"
                  className="show-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </div>

            {/* THÔNG BÁO LỖI */}

            {error && <div className="error-message">{error}</div>}

            {/* NÚT ĐĂNG NHẬP */}

            <button type="submit" className="login-button">
              Đăng nhập
            </button>
          </form>

          <p className="support">
            Không đăng nhập được? Liên hệ Quản trị hệ thống để được hỗ trợ.
          </p>
        </div>
      </section>
    </div>
  );
}

function DashboardRoute() {
  const handleLogout = async () => {
    clearLocalSession();
  };

  return (
    <Dashboard
      role="HRManager"
      userName="HR Manager User"
      onLogout={handleLogout}
    />
  );
}
function ProfileRoute() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    clearLocalSession();
    navigate("/login");
  };

  const handleMenuSelect = (label: string) => {
    if (label === "Tổng quan") {
      navigate("/dashboard");
      return;
    }

    if (label === "Phòng ban & tổ chức") {
      navigate("/departments");
      return;
    }

    if (label === "Chức danh & dải lương") {
      navigate("/job-titles");
      return;
    }

    if (label === "Hồ sơ cá nhân") {
      navigate("/profile");
      return;
    }
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role="HRManager"
        userName="HR Manager User"
        onLogout={handleLogout}
        selectedMenu="Hồ sơ cá nhân"
        onMenuSelect={handleMenuSelect}
      />

      <main className="dashboard-content">
        <UserProfilePage />
      </main>
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
        <Route path="/departments" element={<DepartmentManagement />} />
        <Route path="/profile" element={<ProfileRoute />} />

        <Route path="/job-titles" element={<JobTitleSalaryManagement />} />

        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login />} />

        <Route path="/dashboard" element={<DashboardRoute />} />

        <Route path="/forgot-password" element={<ForgotPassword />} />

        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/change-password" element={<ChangePassword />} />

        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="/500" element={<ServerErrorPage />} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
