import { useState } from "react";
import type { FormEvent } from "react";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Vui lòng nhập đầy đủ email công ty và mật khẩu.");
      return;
    }

    setError("Giao diện đã hoàn thành, đang chờ kết nối Backend.");
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

            <div className="form-group">
              <div className="password-header">
                <label>Mật khẩu</label>
                <a href="#">Quên mật khẩu?</a>
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

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
            >
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

export default App;