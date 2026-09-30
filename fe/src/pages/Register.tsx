import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";
import { readApiResponse } from "../services/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";
type Registration = { fullName: string; email: string; phone: string; password: string };

function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Registration>({ fullName: "", email: "", phone: "", password: "" });
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"details" | "otp">("details");
  const [seconds, setSeconds] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "otp" || (!seconds && !resendSeconds)) return;
    const timer = window.setInterval(() => {
      setSeconds((value) => Math.max(value - 1, 0));
      setResendSeconds((value) => Math.max(value - 1, 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, seconds, resendSeconds]);

  const sendOtp = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setError("");
    if (!form.fullName.trim() || !form.email.trim() || form.password.length < 8) {
      setError("Vui lòng nhập họ tên, email hợp lệ và mật khẩu có ít nhất 8 ký tự.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fullName: form.fullName.trim(), email: form.email.trim().toLowerCase() }),
      });
      await readApiResponse<{ message: string }>(response);
      setStep("otp"); setSeconds(600); setResendSeconds(60);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể gửi mã OTP.");
    } finally { setBusy(false); }
  };

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (!/^\d{6}$/.test(otp)) { setError("Vui lòng nhập đủ 6 chữ số OTP."); return; }
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/verify-registration-otp`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), otp }),
      });
      await readApiResponse(response);
      navigate("/login", { replace: true, state: { registrationComplete: true } });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể xác minh OTP.");
    } finally { setBusy(false); }
  };

  const update = (key: keyof Registration) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));

  return <AuthLayout>
    <Link className="back-link" to="/login">← Quay lại đăng nhập</Link>
    <div className="auth-heading">
      <span className="welcome">TẠO TÀI KHOẢN ỨNG VIÊN</span>
      <h2>{step === "details" ? "Đăng ký tài khoản" : "Xác thực email"}</h2>
      <p className="login-note">{step === "details" ? "Nhập thông tin để bắt đầu ứng tuyển." : `Nhập mã OTP vừa gửi đến ${form.email}.`}</p>
    </div>
    {step === "details" ? <form onSubmit={sendOtp}>
      <div className="form-group"><label htmlFor="register-name">Họ và tên</label><div className="input-box"><input id="register-name" autoComplete="name" value={form.fullName} onChange={update("fullName")} placeholder="Nguyễn Văn A" required /></div></div>
      <div className="form-group"><label htmlFor="register-email">Email Gmail</label><div className="input-box"><span className="input-icon">✉</span><input id="register-email" type="email" autoComplete="email" value={form.email} onChange={update("email")} placeholder="ban@gmail.com" required /></div></div>
      <div className="form-group"><label htmlFor="register-phone">Số điện thoại <span className="optional-label">(không bắt buộc)</span></label><div className="input-box"><input id="register-phone" type="tel" autoComplete="tel" value={form.phone} onChange={update("phone")} placeholder="090..." /></div></div>
      <div className="form-group"><label htmlFor="register-password">Mật khẩu</label><div className="input-box"><input id="register-password" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={update("password")} placeholder="Ít nhất 8 ký tự" required /></div></div>
      {error && <div className="error-message" role="alert">{error}</div>}
      <button type="submit" className="login-button" disabled={busy}>{busy ? "Đang gửi mã..." : "Gửi mã OTP đến Gmail"}</button>
    </form> : <form onSubmit={verifyOtp}>
      <div className="form-group"><label htmlFor="register-otp">Mã OTP 6 số</label><div className="input-box otp-box"><span className="input-icon">#</span><input id="register-otp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} /></div></div>
      {error && <div className="error-message" role="alert">{error}</div>}
      <button type="submit" className="login-button" disabled={busy}>{busy ? "Đang xác minh..." : "Xác nhận và tạo tài khoản"}</button>
      <div className="otp-footer"><span>Mã hết hạn sau {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span><button type="button" className="text-button" onClick={() => void sendOtp()} disabled={resendSeconds > 0 || busy}>{resendSeconds ? `Gửi lại sau ${resendSeconds}s` : "Gửi lại mã"}</button></div>
    </form>}
    <div className="security-message" role="status"><span className="security-icon">✓</span><span>Mã OTP có hiệu lực trong 10 phút. Hãy kiểm tra hộp thư đến và thư mục spam.</span></div>
  </AuthLayout>;
}

export default Register;
