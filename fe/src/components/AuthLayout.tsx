import type { ReactNode } from "react";

type AuthLayoutProps = {
  children: ReactNode;
};

function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <section className="left-panel">
        <div className="logo">
          <div className="logo-icon">A</div>
          <div>
            <h2>ATS</h2>
            <p>Internal Recruitment</p>
          </div>
        </div>

        <div className="left-content">
          <span className="small-title">HỆ THỐNG TUYỂN DỤNG NỘI BỘ</span>
          <h1>
            Tuyển đúng người.
            <br />
            Theo dõi đúng quy trình.
          </h1>
          <p className="description">
            Quản lý tập trung yêu cầu tuyển dụng, ứng viên, phỏng vấn và quyết
            định tuyển dụng trên một hệ thống duy nhất.
          </p>

          <div className="feature-box">
            <div className="feature-icon">✓</div>
            <div>
              <h3>Phân quyền theo vai trò</h3>
              <p>Chỉ truy cập đúng dữ liệu thuộc phạm vi được cấp.</p>
            </div>
          </div>

          <div className="feature-box">
            <div className="feature-icon">◎</div>
            <div>
              <h3>Quy trình tuyển dụng tập trung</h3>
              <p>Theo dõi xuyên suốt từ yêu cầu tuyển dụng đến nhận việc.</p>
            </div>
          </div>
        </div>

        <p className="copyright">© 2026 ATS Recruitment System</p>
      </section>

      <section className="right-panel">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}

export default AuthLayout;