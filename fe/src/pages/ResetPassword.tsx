import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { readApiResponse } from "../services/api";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    const resetToken = sessionStorage.getItem("passwordResetToken");
    if (!resetToken) {
      setError("Phiên xác thực không còn hợp lệ. Vui lòng yêu cầu OTP mới.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      await readApiResponse<{ message: string }>(response);
      sessionStorage.removeItem("passwordResetToken");
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setIsSubmitting(false);
    }
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
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
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

            <button type="submit" className="login-button" disabled={isSubmitting}>
              Đặt lại mật khẩu
            </button>
          </form>
      )}

      <p className="support">Phiên đặt lại mật khẩu chỉ có hiệu lực trong 10 phút.</p>
    </AuthLayout>
  );
}

export default ResetPassword;
