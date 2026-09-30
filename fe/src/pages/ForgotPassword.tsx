import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { readApiResponse } from "../services/api";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

const GENERIC_MESSAGE =
  "Nếu email này tồn tại trong hệ thống, bạn sẽ nhận được mã OTP xác thực có hiệu lực trong 10 phút và chỉ sử dụng được 1 lần.";

function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [secondsRemaining, setSecondsRemaining] = useState(1800);
  const [resendSecondsRemaining, setResendSecondsRemaining] = useState(0);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (step !== "otp" || (secondsRemaining === 0 && resendSecondsRemaining === 0)) {
      return;
    }

    const timer = window.setInterval(() => {
      setSecondsRemaining((seconds) => Math.max(seconds - 1, 0));
      setResendSecondsRemaining((seconds) => Math.max(seconds - 1, 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsRemaining, resendSecondsRemaining, step]);

  const formattedTime = `${String(Math.floor(secondsRemaining / 60)).padStart(
    2,
    "0",
  )}:${String(secondsRemaining % 60).padStart(2, "0")}`;

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Vui lòng nhập email công ty hợp lệ.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      await readApiResponse<{ message: string }>(response);
      setStep("otp");
      setSecondsRemaining(600);
      setResendSecondsRemaining(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể kết nối máy chủ.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (!/^\d{6}$/.test(otp)) {
      setError("Vui lòng nhập đủ 6 chữ số OTP.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-reset-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), otp }),
      });
      const result = await readApiResponse<{ resetToken: string }>(response);
      sessionStorage.setItem("passwordResetToken", result.resetToken);
      navigate("/reset-password");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xác minh OTP.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setOtp("");
    setError("");
    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      await readApiResponse<{ message: string }>(response);
      setSecondsRemaining(600);
      setResendSecondsRemaining(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể gửi lại OTP.");
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
        <span className="welcome">KHÔI PHỤC QUYỀN TRUY CẬP</span>
        <h2>{step === "email" ? "Quên mật khẩu?" : "Xác thực OTP"}</h2>
        <p className="login-note">
          {step === "email"
            ? "Nhập email công ty để nhận mã xác thực đặt lại mật khẩu."
            : `Mã OTP đã được gửi đến ${email}.`}
        </p>
      </div>

      {step === "email" ? (
        <form onSubmit={handleEmailSubmit}>
          <div className="form-group">
            <label htmlFor="forgot-email">Email công ty</label>
            <div className="input-box">
              <span className="input-icon">✉</span>
              <input
                id="forgot-email"
                type="email"
                placeholder="tenban@congty.vn"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
          {error && <div className="error-message">{error}</div>}
          <button type="submit" className="login-button" disabled={isSubmitting}>
            Gửi mã xác thực OTP
          </button>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit}>
          <div className="form-group">
            <label htmlFor="otp">Mã OTP 6 số</label>
            <div className="input-box otp-box">
              <span className="input-icon">#</span>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(event) =>
                  setOtp(event.target.value.replace(/\D/g, ""))
                }
              />
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="login-button" disabled={isSubmitting}>
            Xác nhận OTP
          </button>

          <div className="otp-footer">
            <span>Thời gian còn lại: {formattedTime}</span>
            <button
              type="button"
              className="text-button"
              onClick={handleResend}
              disabled={resendSecondsRemaining > 0 || isSubmitting}
            >
              {resendSecondsRemaining > 0
                ? `Gửi lại mã sau ${resendSecondsRemaining}s`
                : "Gửi lại mã"}
            </button>
          </div>
        </form>
      )}

      <div className="security-message" role="status">
        <span className="security-icon">✓</span>
        <span>{GENERIC_MESSAGE}</span>
      </div>

      <p className="support">
        Không nhận được email? Kiểm tra thư mục spam hoặc thử gửi lại mã.
      </p>
    </AuthLayout>
  );
}

export default ForgotPassword;
