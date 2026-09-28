import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

const API_BASE_URL = "http://localhost:8080/api";

type LoginResponse = {
  accessToken: string;
  tokenType: string;
  userId: number;
  email: string;
  roles: string[];
};

type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T | null;
};

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ email công ty và mật khẩu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const result = (await response.json()) as ApiResponse<LoginResponse>;

      if (!response.ok || !result.success || !result.data) {
        setError(result.message || "Email hoặc mật khẩu không chính xác.");
        return;
      }

      sessionStorage.setItem("ats.accessToken", result.data.accessToken);
      sessionStorage.setItem("ats.user", JSON.stringify({
        userId: result.data.userId,
        email: result.data.email,
        roles: result.data.roles,
      }));
      setSuccess(`Đăng nhập thành công. Vai trò: ${result.data.roles.join(", ")}.`);
    } catch {
      setError("Không kết nối được máy chủ. Hãy kiểm tra backend đang chạy rồi thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="left-panel">
        <div className="logo">
          <div className="logo-icon">A</div>

          <div>
            <h2>ATS</h2>
            <p>Internal Recruitment</p>
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
            Quản lý tập trung yêu cầu tuyển dụng, ứng viên,
            phỏng vấn và quyết định tuyển dụng trên một hệ thống duy nhất.
          </p>

          <div className="feature-box">
            <div className="feature-icon">✓</div>

            <div>
              <h3>Phân quyền theo vai trò</h3>
              <p>
                Chỉ truy cập đúng dữ liệu thuộc phạm vi được cấp.
              </p>
            </div>
          </div>

          <div className="feature-box">
            <div className="feature-icon">◎</div>

            <div>
              <h3>Quy trình tuyển dụng tập trung</h3>
              <p>
                Theo dõi xuyên suốt từ yêu cầu tuyển dụng đến nhận việc.
              </p>
            </div>
          </div>
        </div>

        <p className="copyright">
          © 2026 ATS Recruitment System
        </p>
      </section>

      <section className="right-panel">
        <div className="login-card">
          <span className="welcome">
            CHÀO MỪNG TRỞ LẠI
          </span>

          <h2>Đăng nhập</h2>

          <p className="login-note">
            Sử dụng tài khoản công ty để tiếp tục vào hệ thống.
          </p>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="email">Email công ty</label>

              <div className="input-box">
                <span className="input-icon">✉</span>

                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="tenban@congty.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <div className="password-header">
                <label htmlFor="password">Mật khẩu</label>
                <a href="#">Quên mật khẩu?</a>
              </div>

              <div className="input-box">
                <span className="input-icon">🔒</span>

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
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

            {error && <div className="error-message" role="alert">{error}</div>}
            {success && <div className="success-message" role="status">{success}</div>}

            <button
              type="submit"
              className="login-button"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Đang đăng nhập…" : "Đăng nhập"}
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

export default App;
