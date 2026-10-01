import { useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useSearchParams,
} from "react-router-dom";

import AuthLayout from "../components/AuthLayout";

const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";


function ResetPassword() {
  const [searchParams] =
    useSearchParams();

  const token =
    searchParams.get("token") || "";

  const [password, setPassword] =
    useState("");

  const [
    confirmation,
    setConfirmation,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showConfirmation,
    setShowConfirmation,
  ] = useState(false);

  const [
    submitted,
    setSubmitted,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [error, setError] =
    useState("");


  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");


    if (!token) {
      setError(
        "Liên kết đặt lại mật khẩu không hợp lệ."
      );

      return;
    }


    if (password.length < 8) {
      setError(
        "Mật khẩu mới phải có ít nhất 8 ký tự."
      );

      return;
    }


    if (!/[A-Z]/.test(password)) {
      setError(
        "Mật khẩu phải có ít nhất 1 chữ hoa."
      );

      return;
    }


    if (!/[a-z]/.test(password)) {
      setError(
        "Mật khẩu phải có ít nhất 1 chữ thường."
      );

      return;
    }


    if (!/\d/.test(password)) {
      setError(
        "Mật khẩu phải có ít nhất 1 chữ số."
      );

      return;
    }


    if (
      !/[^A-Za-z0-9]/.test(password)
    ) {
      setError(
        "Mật khẩu phải có ít nhất 1 ký tự đặc biệt."
      );

      return;
    }


    if (
      password !== confirmation
    ) {
      setError(
        "Mật khẩu xác nhận không khớp."
      );

      return;
    }


    setSubmitting(true);


    try {
      const response =
        await fetch(
          `${API_URL}/api/auth/reset-password`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              token,

              newPassword:
                password,
            }),
          }
        );


      const result =
        await response
          .json()
          .catch(() => null);


      if (!response.ok) {
        throw new Error(
          result?.error?.message ||
          "Không thể đặt lại mật khẩu."
        );
      }


      setSubmitted(true);

    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Không thể kết nối đến máy chủ."
      );

    } finally {
      setSubmitting(false);
    }
  };


  return (
    <AuthLayout>

      <Link
        className="back-link"
        to="/login"
      >
        ← Quay lại đăng nhập
      </Link>


      <div className="auth-heading">

        <span className="welcome">
          BẢO MẬT TÀI KHOẢN
        </span>

        <h2>
          Đặt lại mật khẩu
        </h2>

        <p className="login-note">
          Tạo mật khẩu mới để tiếp tục
          sử dụng tài khoản nội bộ.
        </p>

      </div>


      {!token && (
        <div className="error-message">
          Liên kết đặt lại mật khẩu
          không hợp lệ hoặc thiếu token.
        </div>
      )}


      {submitted ? (

        <div
          className="reset-success"
          role="status"
        >

          <div className="success-check">
            ✓
          </div>

          <h3>
            Đặt lại mật khẩu thành công
          </h3>

          <p>
            Mật khẩu mới đã được cập nhật
            vào hệ thống.
          </p>

          <Link
            className=
              "login-button success-button"
            to="/login"
          >
            Quay lại Đăng nhập
          </Link>

        </div>

      ) : (

        token && (

          <form onSubmit={handleSubmit}>

            <div className="form-group">

              <label htmlFor="new-password">
                Mật khẩu mới
              </label>


              <div className="input-box">

                <span className="input-icon">
                  🔒
                </span>


                <input
                  id="new-password"
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  placeholder="Tối thiểu 8 ký tự"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                />


                <button
                  type="button"
                  className="show-password"
                  onClick={() =>
                    setShowPassword(
                      (value) => !value
                    )
                  }
                >
                  {showPassword
                    ? "Ẩn"
                    : "Hiện"}
                </button>

              </div>

            </div>


            <div className="form-group">

              <label htmlFor="confirm-password">
                Xác nhận mật khẩu mới
              </label>


              <div className="input-box">

                <span className="input-icon">
                  🔒
                </span>


                <input
                  id="confirm-password"
                  type={
                    showConfirmation
                      ? "text"
                      : "password"
                  }
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmation}
                  onChange={(event) =>
                    setConfirmation(
                      event.target.value
                    )
                  }
                />


                <button
                  type="button"
                  className="show-password"
                  onClick={() =>
                    setShowConfirmation(
                      (value) => !value
                    )
                  }
                >
                  {showConfirmation
                    ? "Ẩn"
                    : "Hiện"}
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
              disabled={submitting}
            >
              {submitting
                ? "Đang cập nhật..."
                : "Đặt lại mật khẩu"}
            </button>

          </form>
        )
      )}


      <p className="support">
        Liên kết xác thực chỉ có hiệu lực
        trong 30 phút và chỉ dùng một lần.
      </p>

    </AuthLayout>
  );
}


export default ResetPassword;