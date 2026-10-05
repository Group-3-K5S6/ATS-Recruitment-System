import { useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Role } from "../data/roleMenus";
import { roleMenus } from "../data/roleMenus";

type SidebarProps = {
  role: Role;
  userName: string;
  onLogout: () => Promise<void>;

  // Dùng cho Dashboard/S1-08.
  // Trang khác như ErrorPages không bắt buộc truyền.
  selectedMenu?: string;
  onMenuSelect?: (label: string) => void;
};

const roleLabel: Record<Role, string> = {
  Candidate: "Ứng viên",
  Recruiter: "Nhân viên tuyển dụng",
  HiringManager: "Trưởng bộ phận",
  Interviewer: "Người phỏng vấn",
  HRManager: "Trưởng phòng Nhân sự",
  Approver: "Người duyệt",
  Admin: "Quản trị hệ thống",
};

function Sidebar({
  role,
  userName,
  onLogout,
  selectedMenu,
  onMenuSelect,
}: SidebarProps) {
  const [open, setOpen] = useState(false);

  const navigate = useNavigate();

  /*
   * Menu theo vai trò
   * + 2 chức năng chung cho mọi tài khoản
   */
  const menu = [
    ...roleMenus[role],
    { label: "Hồ sơ cá nhân" },
    { label: "Đổi mật khẩu" },
  ];

  const handleLogout = async () => {
    await onLogout();
  };

  const handleMenuClick = (label: string) => {
    /*
     * S1-04:
     * Chuyển trực tiếp tới trang đổi mật khẩu
     * trên cùng tab để giữ sessionStorage.
     */
    if (label === "Đổi mật khẩu") {
      navigate("/change-password");
      setOpen(false);
      return;
    }

    /*
     * Các menu còn lại giữ nguyên cơ chế hiện tại.
     */
    if (onMenuSelect) {
      onMenuSelect(label);
    }

    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="mobile-menu-button"
        onClick={() => setOpen(!open)}
      >
        ☰
      </button>

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">A</div>

          <div>
            <h2>ATS</h2>
            <p>Hệ Thống Tuyển Dụng Nội Bộ</p>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {userName
              .split(" ")
              .slice(-2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()}
          </div>

          <div>
            <strong>{userName}</strong>
            <p>{roleLabel[role]}</p>
          </div>
        </div>

        <nav className="sidebar-menu">
          {menu.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`sidebar-menu-item ${
                selectedMenu === item.label ? "active" : ""
              }`}
              onClick={() => handleMenuClick(item.label)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className="logout-button"
          onClick={handleLogout}
        >
          Đăng xuất
        </button>
      </aside>
    </>
  );
}

export default Sidebar;