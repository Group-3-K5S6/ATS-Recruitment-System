import { useState } from "react";
import type { Role } from "../data/roleMenus";
import { roleMenus } from "../data/roleMenus";

type SidebarProps = {
  role: Role;
  userName: string;
};

const roleLabel: Record<Role, string> = {
  Recruiter: "Nhân viên tuyển dụng",
  HiringManager: "Trưởng bộ phận",
  Interviewer: "Người phỏng vấn",
  HRManager: "Trưởng phòng Nhân sự",
  Approver: "Người duyệt",
  Admin: "Quản trị hệ thống",
};

function Sidebar({ role, userName }: SidebarProps) {
  const [open, setOpen] = useState(false);

  const menu = roleMenus[role];

  return (
    <>
      <button className="mobile-menu-button" onClick={() => setOpen(!open)}>
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
          {menu.map((item, index) => (
            <button
              key={item.label}
              className={`sidebar-menu-item ${index === 0 ? "active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <button className="logout-button">Đăng xuất</button>
      </aside>
    </>
  );
}

export default Sidebar;
