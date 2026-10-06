import { useState } from "react";
import type { FormEvent } from "react";

import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";

import {
  Link,
  useNavigate,
} from "react-router-dom";

import "../App.css";


/* =========================================================
   BACKEND
========================================================= */

const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";


/* =========================================================
   KIỂU DỮ LIỆU
========================================================= */

type PasswordVisibility = {
  current: boolean;
  next: boolean;
  confirmation: boolean;
};


type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};


type ApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;

  error?: {
    message?: string;
    code?: string;
  };
};


/* =========================================================
   S1-04 - QUY TẮC MẬT KHẨU

   Yêu cầu:
   - Tối thiểu 8 ký tự
   - Có chữ
   - Có số
========================================================= */

const passwordRules: PasswordRule[] = [
  {
    label: "Tối thiểu 8 ký tự",
    test: (password) =>
      password.length >= 8,
  },

  {
    label: "Có ít nhất 1 chữ cái",
    test: (password) =>
      /[A-Za-z]/.test(password),
  },

  {
    label: "Có ít nhất 1 chữ số",
    test: (password) =>
      /\d/.test(password),
  },
];


const initialVisibility: PasswordVisibility = {
  current: false,
  next: false,
  confirmation: false,
};


/* =========================================================
   COMPONENT
========================================================= */

function ChangePassword() {

  const navigate =
    useNavigate();


  const [
    currentPassword,
    setCurrentPassword,
  ] = useState("");


  const [
    newPassword,
    setNewPassword,
  ] = useState("");


  const [
    confirmation,
    setConfirmation,
  ] = useState("");


  const [
    visibility,
    setVisibility,
  ] = useState<PasswordVisibility>(
    initialVisibility
  );


  const [
    errors,
    setErrors,
  ] = useState<Record<string, string>>({});


  const [
    apiError,
    setApiError,
  ] = useState("");


  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);


  /* =========================================================
     KIỂM TRA PASSWORD
  ========================================================= */

  const allRulesValid =
    passwordRules.every(
      (rule) =>
        rule.test(newPassword)
    );


  const passwordsMatch =
    newPassword === confirmation &&
    confirmation.length > 0;


  const confirmationError =
    confirmation.length > 0 &&
    !passwordsMatch
      ? "Mật khẩu xác nhận không khớp."
      : errors.confirmation;


  /* =========================================================
     VALIDATE FORM
  ========================================================= */

  const validate = () => {

    const nextErrors:
      Record<string, string> = {};


    if (!currentPassword) {
      nextErrors.currentPassword =
        "Vui lòng nhập mật khẩu hiện tại.";
    }


    if (!newPassword) {
      nextErrors.newPassword =
        "Vui lòng nhập mật khẩu mới.";

    } else if (!allRulesValid) {
      nextErrors.newPassword =
        "Mật khẩu mới phải tối thiểu 8 ký tự, có chữ và số.";
    }


    if (!confirmation) {
      nextErrors.confirmation =
        "Vui lòng xác nhận mật khẩu mới.";

    } else if (!passwordsMatch) {
      nextErrors.confirmation =
        "Mật khẩu xác nhận không khớp.";
    }


    setErrors(nextErrors);

    return (
      Object.keys(nextErrors).length === 0
    );
  };


  /* =========================================================
     XÓA PHIÊN ĐĂNG NHẬP
  ========================================================= */

  const clearSession = () => {

    sessionStorage.removeItem(
      "accessToken"
    );

    sessionStorage.removeItem(
      "refreshToken"
    );

    sessionStorage.removeItem(
      "atsUser"
    );
  };


  /* =========================================================
     S1-04 - GỌI API ĐỔI MẬT KHẨU
  ========================================================= */

  const handleSubmit =
    async (
      event: FormEvent<HTMLFormElement>
    ) => {

      event.preventDefault();

      setApiError("");


      if (!validate()) {
        return;
      }


      /* =========================
         LẤY ACCESS TOKEN
      ========================= */

      const accessToken =
        sessionStorage.getItem(
          "accessToken"
        );


      if (!accessToken) {

        clearSession();

        navigate(
          "/login",
          {
            replace: true,
          }
        );

        return;
      }


      setIsSubmitting(true);


      try {

        const response =
          await fetch(
            `${API_URL}/api/auth/change-password`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${accessToken}`,
              },

              body:
                JSON.stringify({
                  currentPassword,
                  newPassword,
                }),
            }
          );


        const result =
          await response
            .json()
            .catch(
              () =>
                ({}) as ApiResponse
            );


        const apiResult =
          result as ApiResponse;


        /* =========================
           BACKEND BÁO LỖI
        ========================= */

        if (!response.ok) {

          const message =
            apiResult.error?.message ||
            apiResult.message ||
            "Không thể đổi mật khẩu.";


          setApiError(message);


          /*
           * Phiên không còn hợp lệ:
           * xóa toàn bộ session
           * và quay về đăng nhập.
           */

          if (
            response.status === 401
          ) {

            clearSession();

            window.setTimeout(
              () => {

                navigate(
                  "/login",
                  {
                    replace: true,
                  }
                );

              },
              1000
            );
          }


          return;
        }


        /* =====================================================
           ĐỔI MẬT KHẨU THÀNH CÔNG

           Backend đã:
           - kiểm tra mật khẩu hiện tại
           - cập nhật passwordHash trong CSDL
           - thu hồi phiên cũ

           Frontend:
           - xóa session hiện tại
           - quay ngay về màn hình đăng nhập
        ===================================================== */

        clearSession();


        navigate(
          "/login",
          {
            replace: true,

            state: {
              message:
                "Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.",
            },
          }
        );

        return;


      } catch (error) {

        console.error(
          "[S1-04] Change password error:",
          error
        );


        setApiError(
          "Không thể kết nối đến máy chủ. Vui lòng kiểm tra Backend."
        );


      } finally {

        setIsSubmitting(false);

      }
    };


  /* =========================================================
     HIỆN / ẨN MẬT KHẨU
  ========================================================= */

  const toggleVisibility = (
    field: keyof PasswordVisibility
  ) => {

    setVisibility(
      (current) => ({
        ...current,

        [field]:
          !current[field],
      })
    );
  };


  /* =========================================================
     FIELD PASSWORD
  ========================================================= */

  const renderPasswordField = (
    field: keyof PasswordVisibility,
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    error?: string
  ) => (

    <div className="change-password-field">

      <label htmlFor={id}>
        {label}
      </label>


      <div
        className={
          `change-password-input ${
            error
              ? "has-error"
              : ""
          }`
        }
      >

        <Lock
          size={18}
          aria-hidden="true"
        />


        <input
          id={id}

          type={
            visibility[field]
              ? "text"
              : "password"
          }

          value={value}

          disabled={
            isSubmitting
          }

          onChange={
            (event) =>
              onChange(
                event.target.value
              )
          }

          aria-invalid={
            Boolean(error)
          }

          aria-describedby={
            error
              ? `${id}-error`
              : undefined
          }
        />


        <button
          type="button"

          className=
            "password-visibility-button"

          onClick={
            () =>
              toggleVisibility(
                field
              )
          }

          aria-label={
            visibility[field]
              ? `Ẩn ${label}`
              : `Hiện ${label}`
          }

          title={
            visibility[field]
              ? `Ẩn ${label}`
              : `Hiện ${label}`
          }

          disabled={
            isSubmitting
          }
        >

          {
            visibility[field]
              ? (
                <EyeOff
                  size={18}
                />
              )
              : (
                <Eye
                  size={18}
                />
              )
          }

        </button>

      </div>


      {
        error && (

          <p
            id={`${id}-error`}
            className=
              "change-password-error"
            role="alert"
          >
            {error}
          </p>
        )
      }

    </div>
  );


  /* =========================================================
     GIAO DIỆN
  ========================================================= */

  return (

    <main className="change-password-page">

      <section
        className="change-password-card"
        aria-labelledby=
          "change-password-title"
      >

        <div className=
          "change-password-header"
        >

          <div className=
            "change-password-header-icon"
          >

            <ShieldCheck
              size={26}
              aria-hidden="true"
            />

          </div>


          <div>

            <span className=
              "change-password-eyebrow"
            >
              BẢO MẬT TÀI KHOẢN
            </span>


            <h1 id="change-password-title">
              Đổi mật khẩu
            </h1>


            <p>
              Giữ tài khoản nội bộ của bạn
              luôn an toàn.
            </p>

          </div>

        </div>


        <form
          onSubmit={handleSubmit}
          noValidate
        >

          {
            renderPasswordField(
              "current",
              "current-password",
              "Mật khẩu hiện tại",
              currentPassword,
              setCurrentPassword,
              errors.currentPassword
            )
          }


          <div className=
            "change-password-field"
          >

            {
              renderPasswordField(
                "next",
                "new-password",
                "Mật khẩu mới",
                newPassword,
                setNewPassword,
                errors.newPassword
              )
            }


            <div
              className="password-rules"
              aria-label=
                "Yêu cầu mật khẩu"
            >

              {
                passwordRules.map(
                  (rule) => {

                    const valid =
                      rule.test(
                        newPassword
                      );


                    return (

                      <div
                        className={
                          `password-rule ${
                            valid
                              ? "is-valid"
                              : ""
                          }`
                        }

                        key={
                          rule.label
                        }
                      >

                        <span className=
                          "password-rule-icon"
                        >

                          {
                            valid
                              ? (
                                <Check
                                  size={13}
                                />
                              )
                              : (
                                <X
                                  size={13}
                                />
                              )
                          }

                        </span>


                        <span>
                          {rule.label}
                        </span>

                      </div>
                    );
                  }
                )
              }

            </div>

          </div>


          {
            renderPasswordField(
              "confirmation",
              "confirm-password",
              "Xác nhận mật khẩu mới",
              confirmation,
              setConfirmation,
              confirmationError
            )
          }


          {
            apiError && (

              <p
                className=
                  "change-password-error"
                role="alert"
              >
                {apiError}
              </p>
            )
          }


          <button
            className=
              "change-password-submit"

            type="submit"

            disabled={
              isSubmitting
            }
          >

            {
              isSubmitting
                ? (
                  <>
                    <span
                      className=
                        "change-password-spinner"
                      aria-hidden="true"
                    />

                    Đang cập nhật...
                  </>
                )
                : (
                  <>
                    <KeyRound
                      size={18}
                      aria-hidden="true"
                    />

                    Đổi mật khẩu
                  </>
                )
            }

          </button>

        </form>


        <Link
          className=
            "change-password-back"
          to="/dashboard"
        >
          ← Quay lại trang chính
        </Link>

      </section>

    </main>
  );
}


export default ChangePassword;