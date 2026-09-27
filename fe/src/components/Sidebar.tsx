import { useState } from "react";
import type { Role } from "../data/roleMenus";
import { roleMenus } from "../data/roleMenus";

type SidebarProps = {
  role: Role;
  userName: string;
  selectedMenu?: string;
  onMenuSelect?: (label: string) => void;
};

const roleLabel: Record<Role, string> = {
  Recruiter: "Nhân viên tuyển dụng",
  HiringManager: "Trưởng bộ phận",
  Interviewer: "Người phỏng vấn",
  HRManager: "Trưởng phòng Nhân sự",
  Approver: "Người duyệt",
  Admin: "Quản trị hệ thống",
};

function Sidebar({ role, userName, selectedMenu, onMenuSelect }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const [localSelectedMenu, setLocalSelectedMenu] = useState("Tổng quan");
  const menu = roleMenus[role];
  const activeMenu = selectedMenu ?? localSelectedMenu;

  const handleMenuSelect = (label: string) => {
    setLocalSelectedMenu(label);
    onMenuSelect?.(label);
    setOpen(false);
  };

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
          {menu.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`sidebar-menu-item ${activeMenu === item.label ? "active" : ""}`}
              onClick={() => handleMenuSelect(item.label)}
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
