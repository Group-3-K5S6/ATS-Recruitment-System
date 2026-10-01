import { useState } from "react";
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

  const menu = [...roleMenus[role], { label: "Hồ sơ cá nhân" }];

  const handleLogout = async () => {
    await onLogout();
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
              onClick={() => {
                if (onMenuSelect) {
                  onMenuSelect(item.label);
                }

                setOpen(false);
              }}
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
