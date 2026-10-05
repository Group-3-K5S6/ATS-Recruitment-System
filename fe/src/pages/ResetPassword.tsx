import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import AuthLayout from "../components/AuthLayout";
import {
  PasswordRecoveryError,
  passwordRecoveryService,
} from "../services/passwordRecoveryService";

type ResetState =
  | "checking"
  | "form"
  | "success"
  | "invalid"
  | "expired"
  | "used";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const [resetState, setResetState] = useState<ResetState>(
    token ? "checking" : "invalid"
  );

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    if (!token) return;

    let isCurrent = true;

    passwordRecoveryService
      .validateResetToken(token)
      .then(() => {
        if (isCurrent) {
          setResetState("form");
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCurrent) return;

        if (
          caughtError instanceof PasswordRecoveryError &&
          (caughtError.code === "expired" ||
            caughtError.code === "used" ||
            caughtError.code === "invalid")
        ) {
          setResetState(caughtError.code);
        } else {
          setValidationError(
            "Không thể xác minh liên kết lúc này. Vui lòng thử lại sau."
          );
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [token]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");

    if (!password) {
      setError("Vui lòng nhập mật khẩu mới.");
      return;
    }

    if (!confirmation) {
      setError("Vui lòng xác nhận mật khẩu mới.");
      return;
    }

    if (password.length < 8) {
      setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError("Mật khẩu phải có ít nhất 1 chữ hoa.");
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError("Mật khẩu phải có ít nhất 1 chữ thường.");
      return;
    }

    if (!/\d/.test(password)) {
      setError("Mật khẩu phải có ít nhất 1 chữ số.");
      return;
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      setError("Mật khẩu phải có ít nhất 1 ký tự đặc biệt.");
      return;
    }

    if (password !== confirmation) {
      setError("Mật khẩu xác nhận không khớp với mật khẩu mới.");
      return;
    }

    if (!token) {
      setError("Liên kết đặt lại mật khẩu không hợp lệ.");
      return;
    }

    setIsLoading(true);

    try {
      await passwordRecoveryService.resetPassword(token, password);
      setResetState("success");
    } catch (caughtError: unknown) {
      if (
        caughtError instanceof PasswordRecoveryError &&
        (caughtError.code === "expired" ||
          caughtError.code === "used" ||
          caughtError.code === "invalid")
      ) {
        setResetState(caughtError.code);
      } else {
        setError(
          "Không thể kết nối đến hệ thống. Vui lòng thử lại."
        );
      }
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
        <span className="welcome">BẢO MẬT TÀI KHOẢN</span>

        <h2>Đặt lại mật khẩu</h2>

        <p className="login-note">
          Tạo mật khẩu mới để tiếp tục sử dụng tài khoản của bạn.
        </p>
      </div>

      {resetState === "success" ? (
        <div className="reset-success" role="status">
          <div className="success-check">
            <ShieldCheck size={24} aria-hidden="true" />
          </div>

          <h3>Đổi mật khẩu thành công.</h3>

          <p>Vui lòng đăng nhập lại bằng mật khẩu mới.</p>

          <Link className="login-button success-button" to="/login">
            Đăng nhập
          </Link>
        </div>
      ) : resetState === "expired" ||
        resetState === "used" ||
        resetState === "invalid" ? (
        <div className="recovery-message recovery-error" role="alert">
          <KeyRound size={21} aria-hidden="true" />

          <div>
            <p>
              {resetState === "expired"
                ? "Liên kết đặt lại mật khẩu đã hết hạn."
                : resetState === "used"
                  ? "Liên kết đặt lại mật khẩu đã được sử dụng."
                  : "Liên kết đặt lại mật khẩu không hợp lệ."}
            </p>

            <Link className="recovery-new-link" to="/forgot-password">
              Yêu cầu liên kết mới
            </Link>
          </div>
        </div>
      ) : resetState === "checking" ? (
        <div className="recovery-checking" role="status">
          <LoaderCircle
            size={18}
            className="recovery-spinner"
            aria-hidden="true"
          />
          Đang xác minh liên kết...
        </div>
      ) : validationError ? (
        <div className="recovery-message recovery-error" role="alert">
          <KeyRound size={21} aria-hidden="true" />

          <div>
            <p>{validationError}</p>

            <Link className="recovery-new-link" to="/forgot-password">
              Yêu cầu liên kết mới
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="new-password">Mật khẩu mới</label>

            <div className="input-box">
              <KeyRound
                className="input-icon"
                size={17}
                aria-hidden="true"
              />

              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
              />

              <button
                type="button"
                className="show-password"
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                aria-label={
                  showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                }
                aria-pressed={showPassword}
                onClick={() =>
                  setShowPassword((visible) => !visible)
                }
              >
                {showPassword ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">
              Xác nhận mật khẩu
            </label>

            <div className="input-box">
              <KeyRound
                className="input-icon"
                size={17}
                aria-hidden="true"
              />

              <input
                id="confirm-password"
                type={showConfirmation ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmation}
                onChange={(event) =>
                  setConfirmation(event.target.value)
                }
                disabled={isLoading}
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
                aria-pressed={showConfirmation}
                onClick={() =>
                  setShowConfirmation((visible) => !visible)
                }
              >
                {showConfirmation ? (
                  <EyeOff size={18} />
                ) : (
                  <Eye size={18} />
                )}
              </button>
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
              ? "Đang đặt lại..."
              : "Đặt lại mật khẩu"}
          </button>
        </form>
      )}

      {resetState === "form" && (
        <p className="support">
          Liên kết chỉ có thể sử dụng một lần và có hiệu lực trong
          30 phút.
        </p>
      )}
    </AuthLayout>
  );
}

export default ResetPassword;