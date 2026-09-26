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
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";

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

const currentUser = {
  name: "Nguyễn Văn An",
  role: "Admin" as Role,
};

function ErrorPageLayout({ children }: ErrorPageLayoutProps) {
  const handleLogout = async () => {
    // Logout thật sẽ được nối vào session service khi có backend.
  };

  return (
    <div className="dashboard-layout error-page-layout">
      <Sidebar
        role={currentUser.role}
        userName={currentUser.name}
        onLogout={handleLogout}
      />
      <main className="dashboard-content error-main-content">
        <header className="dashboard-header error-page-header">
          <div>
            <span className="error-page-kicker">ATS RECRUITMENT SYSTEM</span>
            <h1>Trung tâm làm việc</h1>
            <p>Không gian quản lý tuyển dụng nội bộ</p>
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
    <section className={`error-state-card error-accent-${accent}`}>
      <div className="error-state-icon">{icon}</div>
      <span className="error-state-code">ERROR {code}</span>
      <h2>{title}</h2>
      <p className="error-state-description">{description}</p>

      <div className="error-state-actions">
        <button
          type="button"
          className="error-primary-button"
          onClick={() => navigate("/dashboard")}
        >
          <Home size={17} aria-hidden="true" />
          {primaryActionText}
        </button>
        <button
          type="button"
          className="error-secondary-button"
          onClick={() => navigate(-1)}
          title={`Quay lại từ ${location.pathname}`}
        >
          <ArrowLeft size={17} aria-hidden="true" />
          Quay lại trang trước
        </button>
      </div>

      {children}
    </section>
  );
}

export function ForbiddenPage() {
  const [showContact, setShowContact] = useState(false);

  return (
    <ErrorPageLayout>
      <ErrorState
        code="403"
        title="Truy cập bị từ chối"
        description="Bạn không có quyền xem trang này. Vui lòng liên hệ Quản trị viên nếu cần được cấp quyền."
        icon={<ShieldAlert size={42} strokeWidth={1.7} aria-hidden="true" />}
        primaryActionText="Về Dashboard"
        accent="warning"
      >
        <button
          type="button"
          className="error-contact-button"
          onClick={() => setShowContact(true)}
        >
          Liên hệ Admin để yêu cầu cấp quyền
        </button>

        {showContact && (
          <div className="error-modal-backdrop" role="presentation">
            <div
              className="error-contact-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="contact-admin-title"
            >
              <button
                type="button"
                className="error-modal-close"
                onClick={() => setShowContact(false)}
                aria-label="Đóng thông báo"
              >
                <X size={18} />
              </button>
              <div className="error-modal-icon">
                <Check size={20} />
              </div>
              <h3 id="contact-admin-title">Yêu cầu đã được ghi nhận</h3>
              <p>
                Vui lòng gửi mã nhân viên và tên màn hình cần truy cập cho
                Quản trị hệ thống để được hỗ trợ cấp quyền.
              </p>
              <button
                type="button"
                className="error-primary-button"
                onClick={() => setShowContact(false)}
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
        icon={<FileQuestion size={42} strokeWidth={1.7} aria-hidden="true" />}
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
        icon={<ServerCrash size={42} strokeWidth={1.7} aria-hidden="true" />}
        primaryActionText="Về Dashboard"
        accent="danger"
      />
    </ErrorPageLayout>
  );
}