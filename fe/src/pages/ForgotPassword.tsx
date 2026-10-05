import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import AuthLayout from "../components/AuthLayout";
import { passwordRecoveryService } from "../services/passwordRecoveryService";

const SUCCESS_MESSAGE =
  "Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi đến email của bạn. Liên kết có hiệu lực trong 30 phút.";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccessful, setIsSuccessful] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isLoading) return;

    setError("");
    setIsSuccessful(false);

    const trimmedEmail = email.trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Vui lòng nhập email hợp lệ.");
      return;
    }

    setIsLoading(true);

    try {
      await passwordRecoveryService.requestResetLink(trimmedEmail);
      setIsSuccessful(true);
    } catch {
      setError(
        "Không thể gửi yêu cầu lúc này. Vui lòng kiểm tra kết nối và thử lại."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <Link className="back-link" to="/login">
        <ArrowLeft size={16} aria-hidden="true" />
        Quay lại đăng nhập
      </Link>

      <div className="auth-heading">
        <span className="welcome">KHÔI PHỤC QUYỀN TRUY CẬP</span>

        <h2>Quên mật khẩu?</h2>

        <p className="login-note">
          Nhập email công ty để nhận liên kết đặt lại mật khẩu.
        </p>
      </div>

      {isSuccessful ? (
        <div
          className="recovery-message recovery-success"
          role="status"
        >
          <ShieldCheck size={21} aria-hidden="true" />

          <p>{SUCCESS_MESSAGE}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="forgot-email">Email công ty</label>

            <div className="input-box">
              <Mail
                className="input-icon"
                size={17}
                aria-hidden="true"
              />

              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                required
                placeholder="tenban@congty.vn"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="login-button recovery-submit"
            disabled={isLoading}
          >
            {isLoading && (
              <LoaderCircle
                size={18}
                className="recovery-spinner"
                aria-hidden="true"
              />
            )}

            {isLoading
              ? "Đang gửi..."
              : "Gửi liên kết đặt lại mật khẩu"}
          </button>
        </form>
      )}

      <p className="support">
        Vui lòng kiểm tra cả Hộp thư đến, Spam hoặc thư Rác.
      </p>
    </AuthLayout>
  );
}

export default ForgotPassword;