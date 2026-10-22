import { useState } from "react";
import type { ReactNode } from "react";

import {
  ArrowLeft,
  Check,
  FileQuestion,
  Home,
  ServerCrash,
  ShieldAlert,
  X,
} from "lucide-react";

import {
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";

const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";

type ErrorCode = "403" | "404" | "500";

type ErrorStateProps = {
  code: ErrorCode;
  title: string;
  description: string;
  icon: ReactNode;
  primaryActionText?: string;
  accent: "warning" | "neutral" | "danger";
  children?: ReactNode;
};

type ErrorPageLayoutProps = {
  children: ReactNode;
};

type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
};

const roleByCode: Record<string, Role> = {
  CANDIDATE: "Candidate",
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "HiringManager",
  INTERVIEWER: "Interviewer",
  HR_MANAGER: "HRManager",
  APPROVER: "Approver",
  ADMIN: "Admin",
};

function resolveRole(roles: string[]): Role {
  const priority = [
    "ADMIN",
    "HR_MANAGER",
    "RECRUITER",
    "HIRING_MANAGER",
    "INTERVIEWER",
    "APPROVER",
    "CANDIDATE",
  ];

  const roleCode =
    priority.find((item) => roles.includes(item)) ||
    "CANDIDATE";

  return roleByCode[roleCode] || "Candidate";
}

function getSessionUser(): SessionUser | null {
  const raw =
    sessionStorage.getItem("atsUser");

  if (!raw) {
    return null;
  }

  try {
    const user =
      JSON.parse(raw) as SessionUser;

    if (
      !user.id ||
      !user.email ||
      !user.fullName ||
      !Array.isArray(user.roles)
    ) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("atsUser");
  sessionStorage.removeItem("sessionExpired");
}

function ErrorPageLayout({
  children,
}: ErrorPageLayoutProps) {
  const navigate = useNavigate();

  const user = getSessionUser();

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  const role =
    resolveRole(user.roles);

  const handleLogout = async () => {
    const accessToken =
      sessionStorage.getItem("accessToken");

    const refreshToken =
      sessionStorage.getItem("refreshToken");

    try {
      if (accessToken) {
        await fetch(
          `${API_URL}/api/auth/logout`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${accessToken}`,
            },

            body: JSON.stringify({
              refreshToken,
            }),
          }
        );
      }
    } catch {
      // Nếu Backend lỗi vẫn xóa phiên local.
    } finally {
      clearSession();

      navigate(
        "/login",
        {
          replace: true,
        }
      );
    }
  };

  return (
    <div className="dashboard-layout error-page-layout">
      <Sidebar
        role={role}
        userName={user.fullName}
        onLogout={handleLogout}
      />

      <main className="dashboard-content error-main-content">
        <header className="dashboard-header error-page-header">
          <div>
            <span className="error-page-kicker">
              ATS RECRUITMENT SYSTEM
            </span>

            <h1>Trung tâm làm việc</h1>

            <p>
              Không gian quản lý tuyển dụng nội bộ
            </p>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}

function ErrorState({
  code,
  title,
  description,
  icon,
  primaryActionText = "Về trang chủ",
  accent,
  children,
}: ErrorStateProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <section
      className={`error-state-card error-accent-${accent}`}
    >
      <div className="error-state-icon">
        {icon}
      </div>

      <span className="error-state-code">
        ERROR {code}
      </span>

      <h2>{title}</h2>

      <p className="error-state-description">
        {description}
      </p>

      <div className="error-state-actions">
        <button
          type="button"
          className="error-primary-button"
          onClick={() =>
            navigate("/dashboard")
          }
        >
          <Home
            size={17}
            aria-hidden="true"
          />

          {primaryActionText}
        </button>

        <button
          type="button"
          className="error-secondary-button"
          onClick={() =>
            navigate(-1)
          }
          title={`Quay lại từ ${location.pathname}`}
        >
          <ArrowLeft
            size={17}
            aria-hidden="true"
          />

          Quay lại trang trước
        </button>
      </div>

      {children}
    </section>
  );
}

export function ForbiddenPage() {
  const [
    showContact,
    setShowContact,
  ] = useState(false);

  return (
    <ErrorPageLayout>
      <ErrorState
        code="403"
        title="Truy cập bị từ chối"
        description="Bạn không có quyền xem trang này. Vui lòng liên hệ Quản trị viên nếu cần được cấp quyền."
        icon={
          <ShieldAlert
            size={42}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        }
        primaryActionText="Về Dashboard"
        accent="warning"
      >
        <button
          type="button"
          className="error-contact-button"
          onClick={() =>
            setShowContact(true)
          }
        >
          Liên hệ Admin để yêu cầu cấp quyền
        </button>

        {showContact && (
          <div
            className="error-modal-backdrop"
            role="presentation"
          >
            <div
              className="error-contact-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="contact-admin-title"
            >
              <button
                type="button"
                className="error-modal-close"
                onClick={() =>
                  setShowContact(false)
                }
                aria-label="Đóng thông báo"
              >
                <X size={18} />
              </button>

              <div className="error-modal-icon">
                <Check size={20} />
              </div>

              <h3 id="contact-admin-title">
                Yêu cầu đã được ghi nhận
              </h3>

              <p>
                Vui lòng gửi mã nhân viên và tên
                màn hình cần truy cập cho Quản trị
                hệ thống để được hỗ trợ cấp quyền.
              </p>

              <button
                type="button"
                className="error-primary-button"
                onClick={() =>
                  setShowContact(false)
                }
              >
                Đã hiểu
              </button>
            </div>
          </div>
        )}
      </ErrorState>
    </ErrorPageLayout>
  );
}

export function NotFoundPage() {
  return (
    <ErrorPageLayout>
      <ErrorState
        code="404"
        title="Không tìm thấy trang"
        description="Đường dẫn bạn truy cập không tồn tại hoặc nội dung đã được di chuyển sang một vị trí khác."
        icon={
          <FileQuestion
            size={42}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        }
        primaryActionText="Về Dashboard"
        accent="neutral"
      />
    </ErrorPageLayout>
  );
}

export function ServerErrorPage() {
  return (
    <ErrorPageLayout>
      <ErrorState
        code="500"
        title="Hệ thống đang gặp sự cố"
        description="Máy chủ tạm thời không thể xử lý yêu cầu. Vui lòng thử lại sau ít phút hoặc quay về Dashboard."
        icon={
          <ServerCrash
            size={42}
            strokeWidth={1.7}
            aria-hidden="true"
          />
        }
        primaryActionText="Về Dashboard"
        accent="danger"
      />
    </ErrorPageLayout>
  );
}