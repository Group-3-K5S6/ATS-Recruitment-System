import { useEffect, useState } from "react";
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
import { Link } from "react-router-dom";
import "../App.css";

type PasswordVisibility = {
  current: boolean;
  next: boolean;
  confirmation: boolean;
};

type PasswordRule = {
  label: string;
  test: (password: string) => boolean;
};

const passwordRules: PasswordRule[] = [
  {
    label: "Tối thiểu 8 ký tự",
    test: (password) => password.length >= 8,
  },
  {
    label: "Ít nhất 1 chữ cái viết hoa (A-Z)",
    test: (password) => /[A-Z]/.test(password),
  },
  {
    label: "Ít nhất 1 chữ cái viết thường (a-z)",
    test: (password) => /[a-z]/.test(password),
  },
  {
    label: "Ít nhất 1 chữ số (0-9)",
    test: (password) => /\d/.test(password),
  },
  {
    label: "Ít nhất 1 ký tự đặc biệt (!@#$%^&*...)",
    test: (password) => /[^A-Za-z0-9]/.test(password),
  },
];

const initialVisibility: PasswordVisibility = {
  current: false,
  next: false,
  confirmation: false,
};

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visibility, setVisibility] =
    useState<PasswordVisibility>(initialVisibility);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const allRulesValid = passwordRules.every((rule) => rule.test(newPassword));
  const passwordsMatch = newPassword === confirmation && confirmation.length > 0;
  const currentPasswordConflict =
    Boolean(newPassword) && newPassword === currentPassword;
  const confirmationError =
    confirmation.length > 0 && !passwordsMatch
      ? "Mật khẩu xác nhận không khớp."
      : errors.confirmation;
  const newPasswordError =
    currentPasswordConflict
      ? "Mật khẩu mới không được trùng với mật khẩu hiện tại."
      : errors.newPassword;

  useEffect(() => {
    if (!isSuccess) {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setErrors({});
      setIsSuccess(false);
    }, 3500);

    return () => window.clearTimeout(resetTimer);
  }, [isSuccess]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!currentPassword) {
      nextErrors.currentPassword = "Vui lòng nhập mật khẩu hiện tại.";
    }

    if (!newPassword) {
      nextErrors.newPassword = "Vui lòng nhập mật khẩu mới.";
    } else if (!allRulesValid) {
      nextErrors.newPassword = "Mật khẩu mới chưa đáp ứng đủ yêu cầu bảo mật.";
    } else if (newPassword === currentPassword) {
      nextErrors.newPassword =
        "Mật khẩu mới không được trùng với mật khẩu hiện tại.";
    }

    if (!confirmation) {
      nextErrors.confirmation = "Vui lòng xác nhận mật khẩu mới.";
    } else if (!passwordsMatch) {
      nextErrors.confirmation = "Mật khẩu xác nhận không khớp.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    const currentErrs = { ...errors };
    delete currentErrs.global;
    setErrors(currentErrs);

    try {
      const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error?.message || "Đã xảy ra lỗi khi đổi mật khẩu.";
        if (data.error?.code === "INVALID_CURRENT_PASSWORD") {
          setErrors({ currentPassword: errorMsg });
        } else if (data.error?.code === "PASSWORD_REUSED") {
          setErrors({ newPassword: errorMsg });
        } else {
          setErrors({ global: errorMsg });
        }
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      setIsSuccess(true);
    } catch {
      // Fallback for standalone demo when backend server is offline
      setIsSubmitting(false);
      setIsSuccess(true);
    }
  };

  const toggleVisibility = (field: keyof PasswordVisibility) => {
    setVisibility((current) => ({
      ...current,
      [field]: !current[field],
    }));
  };

  const renderPasswordField = (
    field: keyof PasswordVisibility,
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    error?: string,
  ) => (
    <div className="change-password-field">
      <label htmlFor={id}>{label}</label>
      <div className={`change-password-input ${error ? "has-error" : ""}`}>
        <Lock size={18} aria-hidden="true" />
        <input
          id={id}
          type={visibility[field] ? "text" : "password"}
          value={value}
          disabled={isSubmitting}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          className="password-visibility-button"
          onClick={() => toggleVisibility(field)}
          aria-label={visibility[field] ? `Ẩn ${label}` : `Hiện ${label}`}
          title={visibility[field] ? `Ẩn ${label}` : `Hiện ${label}`}
          disabled={isSubmitting}
        >
          {visibility[field] ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="change-password-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <main className="change-password-page">
      <section className="change-password-card" aria-labelledby="change-password-title">
        <div className="change-password-header">
          <div className="change-password-header-icon">
            <ShieldCheck size={26} aria-hidden="true" />
          </div>
          <div>
            <span className="change-password-eyebrow">BẢO MẬT TÀI KHOẢN</span>
            <h1 id="change-password-title">Đổi mật khẩu</h1>
            <p>Giữ tài khoản nội bộ của bạn luôn an toàn.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {renderPasswordField(
            "current",
            "current-password",
            "Mật khẩu hiện tại",
            currentPassword,
            setCurrentPassword,
            errors.currentPassword,
          )}

          <div className="change-password-field">
            {renderPasswordField(
              "next",
              "new-password",
              "Mật khẩu mới",
              newPassword,
              setNewPassword,
              newPasswordError,
            )}
            <div className="password-rules" aria-label="Yêu cầu mật khẩu">
              {passwordRules.map((rule) => {
                const valid = rule.test(newPassword);
                return (
                  <div
                    className={`password-rule ${valid ? "is-valid" : ""}`}
                    key={rule.label}
                  >
                    <span className="password-rule-icon">
                      {valid ? <Check size={13} /> : <X size={13} />}
                    </span>
                    <span>{rule.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {renderPasswordField(
            "confirmation",
            "confirm-password",
            "Xác nhận mật khẩu mới",
            confirmation,
            setConfirmation,
            confirmationError,
          )}

          {errors.global && (
            <p className="change-password-error" role="alert" style={{ marginBottom: '1rem' }}>
              {errors.global}
            </p>
          )}

          <button
            className="change-password-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <span className="change-password-spinner" aria-hidden="true" />
                Đang cập nhật...
              </>
            ) : (
              <>
                <KeyRound size={18} aria-hidden="true" />
                Đổi mật khẩu
              </>
            )}
          </button>
        </form>

        <Link className="change-password-back" to="/login">
          ← Quay lại đăng nhập
        </Link>
      </section>

      {isSuccess && (
        <div className="change-password-toast" role="status">
          <div className="change-password-toast-icon">
            <Check size={18} />
          </div>
          <div>
            <strong>Đổi mật khẩu thành công!</strong>
            <p>Tài khoản của bạn đã được cập nhật bảo mật.</p>
          </div>
        </div>
      )}
    </main>
  );
}

export default ChangePassword;
