import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";

import AuthLayout from "../components/AuthLayout";

const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";

const GENERIC_MESSAGE =
  "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi mã OTP đặt lại mật khẩu. Mã có hiệu lực trong 10 phút.";

function ForgotPassword() {
  const [email, setEmail] =
    useState("");

  const [error, setError] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);


  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    setError("");
    setMessage("");


    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email.trim()
      )
    ) {
      setError(
        "Vui lòng nhập email công ty hợp lệ."
      );

      return;
    }


    setSubmitting(true);


    try {
      const response =
        await fetch(
          `${API_URL}/api/auth/forgot-password`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              email:
                email
                  .trim()
                  .toLowerCase(),
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
          "Không thể gửi yêu cầu đặt lại mật khẩu."
        );
      }


      setMessage(
        result?.data?.message ||
        result?.message ||
        GENERIC_MESSAGE
      );

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
          KHÔI PHỤC QUYỀN TRUY CẬP
        </span>

        <h2>
          Quên mật khẩu?
        </h2>

        <p className="login-note">
          Nhập email công ty để nhận
          mã OTP đặt lại mật khẩu.
        </p>

      </div>


      {!message ? (

        <form onSubmit={handleSubmit}>

          <div className="form-group">

            <label htmlFor="forgot-email">
              Email công ty
            </label>


            <div className="input-box">

              <span className="input-icon">
                ✉
              </span>


              <input
                id="forgot-email"
                type="email"
                placeholder="tenban@congty.vn"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
              />

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
              ? "Đang gửi..."
              : "Gửi mã OTP"}
          </button>

        </form>

      ) : (

        <div
          className="security-message"
          role="status"
        >

          <span className="security-icon">
            ✓
          </span>

          <span>
            {message}
            <br />
            <Link to="/reset-password">Nhập mã OTP để đặt lại mật khẩu</Link>
          </span>

        </div>
      )}


      <p className="support">
        Không nhận được email?
        Kiểm tra Hộp thư đến,
        Spam hoặc thư Rác.
      </p>

    </AuthLayout>
  );
}


export default ForgotPassword;
