import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp.");
      return;
    }

    setSubmitted(true);
  };

  return (
    <AuthLayout>
      <Link className="back-link" to="/login">
        ← Quay lại đăng nhập
      </Link>

      <div className="auth-heading">
        <span className="welcome">BẢO MẬT TÀI KHOẢN</span>
        <h2>Đặt lại mật khẩu</h2>
        <p className="login-note">
          Tạo mật khẩu mới để tiếp tục sử dụng tài khoản nội bộ.
        </p>
      </div>

      {submitted ? (
        <div className="reset-success" role="status">
          <div className="success-check">✓</div>
          <h3>Đặt lại mật khẩu thành công</h3>
          <p>Mật khẩu mới của bạn đã được cập nhật an toàn.</p>
          <Link className="login-button success-button" to="/login">
            Quay lại Đăng nhập
          </Link>
        </div>
      ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="new-password">Mật khẩu mới</label>
              <div className="input-box">
                <span className="input-icon">🔒</span>
                <input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Tối thiểu 8 ký tự"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="show-password"
                  title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  👁
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm-password">Xác nhận mật khẩu mới</label>
              <div className="input-box">
                <span className="input-icon">🔒</span>
                <input
                  id="confirm-password"
                  type={showConfirmation ? "text" : "password"}
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
                <button
                  type="button"
                  className="show-password"
                  title={
                    showConfirmation
                      ? "Ẩn mật khẩu xác nhận"
                      : "Hiện mật khẩu xác nhận"
                  }
                  aria-label={
                    showConfirmation
                      ? "Ẩn mật khẩu xác nhận"
                      : "Hiện mật khẩu xác nhận"
                  }
                  onClick={() => setShowConfirmation((visible) => !visible)}
                >
                  👁
                </button>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button type="submit" className="login-button">
              Đặt lại mật khẩu
            </button>
          </form>
      )}

      <p className="support">Liên kết xác thực chỉ có hiệu lực trong 30 phút.</p>
    </AuthLayout>
  );
}

export default ResetPassword;