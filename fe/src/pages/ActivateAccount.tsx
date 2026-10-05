import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AuthLayout from "../components/AuthLayout";

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

export default function ActivateAccount() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("Đang kích hoạt tài khoản...");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("Không tìm thấy mã kích hoạt trong liên kết.");
      setFailed(true);
      return;
    }
    fetch(`${API_URL}/api/auth/activate-account`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || "Kích hoạt thất bại.");
      setStatus("Tài khoản đã được kích hoạt. Đăng nhập bằng mật khẩu tạm trong email và đổi mật khẩu ngay.");
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Kích hoạt thất bại.");
      setFailed(true);
    });
  }, [params]);

  return <AuthLayout><div className={failed ? "error-message" : "security-message"} role="status">{status}</div><p><Link className="login-button" to="/login">Đến đăng nhập</Link></p></AuthLayout>;
}
