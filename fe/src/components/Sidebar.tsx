import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { Role } from "../data/roleMenus";

const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type SidebarProps = {
  role: Role;
  userName: string;
  onLogout: () => Promise<void>;
  selectedMenu?: string;
  onMenuSelect?: (label: string) => void;
};

type ServerMenuItem = {
  key: string;
  label: string;
  path: string;
  icon: string;
  order: number;
  children: ServerMenuItem[];
};

type MenuResponse = {
  success: boolean;
  data?: ServerMenuItem[];
  error?: {
    message?: string;
  };
};

type SidebarItem = {
  key: string;
  label: string;
  path?: string;
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

/*
 * Tên tiếng Việt dùng ở giao diện.
 * Quyền hiển thị KHÔNG lấy từ đây.
 * Quyền thật do Backend /api/menu quyết định.
 */
function getDisplayLabel(key: string, role: Role, fallback: string) {
  switch (key) {
    case "dashboard":
      return "Tổng quan";

    case "requisitions":
      return "Yêu cầu tuyển dụng";

    case "jobs":
      if (role === "HiringManager") return "Vị trí của tôi";
      if (role === "HRManager") return "Tất cả vị trí tuyển dụng";
      return "Vị trí tuyển dụng";

    case "candidates":
      if (role === "HiringManager") return "Ứng viên theo vị trí";
      return "Ứng viên";

    case "interviews":
      return "Lịch phỏng vấn";

    case "evaluations":
      return "Phiếu đánh giá";

    case "offers":
      if (role === "Approver") return "Offer cần duyệt";
      if (role === "HiringManager") return "Quyết định tuyển";
      return "Offer";

    case "reports":
      return "Báo cáo";

    case "users":
      return "Quản lý tài khoản";

    case "role-management":
      return "Vai trò & quyền";

    case "audit-logs":
      return "Nhật ký hệ thống";

    case "candidate-jobs":
      return "Việc làm";

    case "my-applications":
      return "Hồ sơ đã ứng tuyển";

    case "my-interviews":
      return "Lịch phỏng vấn của tôi";

    case "my-offers":
      return "Offer của tôi";

    default:
      return fallback;
  }
}

const directRouteKeys = new Set([
  "departments",
  "job-titles",
  "competency-frameworks",
  "interview-question-bank",
  "recruitment-shared-categories",
  "company-profile",
  "company-config",
]);

function Sidebar({
  role,
  userName,
  onLogout,
  selectedMenu,
  onMenuSelect,
}: SidebarProps) {
  const [open, setOpen] = useState(false);

  const [serverMenu, setServerMenu] = useState<ServerMenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadMenu() {
      setMenuLoading(true);
      setMenuError("");

      const token = sessionStorage.getItem("accessToken");

      /*
       * Fail closed:
       * Không có phiên đăng nhập thì không tự dựng menu theo role phía FE.
       */
      if (!token) {
        if (!cancelled) {
          setServerMenu([]);
          setMenuError("Không tìm thấy phiên đăng nhập.");
          setMenuLoading(false);
        }

        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/menu`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = (await response.json()) as MenuResponse;

        if (!response.ok || !result.success || !Array.isArray(result.data)) {
          throw new Error(
            result.error?.message || "Không thể tải menu theo quyền."
          );
        }

        if (!cancelled) {
          setServerMenu(result.data);
        }
      } catch (error) {
        if (!cancelled) {
          setServerMenu([]);

          setMenuError(
            error instanceof Error
              ? error.message
              : "Không thể tải menu theo quyền."
          );
        }
      } finally {
        if (!cancelled) {
          setMenuLoading(false);
        }
      }
    }

    void loadMenu();

    return () => {
      cancelled = true;
    };
  }, [role]);

  /*
   * Menu hiển thị lấy từ Backend.
   * Không dùng roleMenus[role] để quyết định quyền nữa.
   */
  const menu: SidebarItem[] = [];

  for (const item of serverMenu) {
    menu.push({
      key: item.key,
      label: getDisplayLabel(item.key, role, item.label),
      path: item.path,
    });

    /*
     * S1-09:
     * Backend users menu có submenu quản lý vai trò.
     * Đưa chức năng đó thành một nút riêng trong Sidebar.
     */
    if (item.key === "users") {
      const roleManagement = item.children?.find(
        (child) => child.key === "role-management"
      );

      if (roleManagement) {
        menu.push({
          key: roleManagement.key,
          label: getDisplayLabel(
            roleManagement.key,
            role,
            roleManagement.label
          ),
          path: roleManagement.path,
        });
      }
    }
  }

  /*
   * Hai chức năng cá nhân dùng chung cho tài khoản đã đăng nhập.
   */
  menu.push(
    {
      key: "profile",
      label: "Hồ sơ cá nhân",
      path: "/profile",
    },
    {
      key: "change-password",
      label: "Đổi mật khẩu",
      path: "/change-password",
    }
  );

  const handleLogout = async () => {
    await onLogout();
  };

  const handleMenuClick = (item: SidebarItem) => {
    /*
     * Các trang có route React thật.
     */
    if (
      directRouteKeys.has(item.key) ||
      item.key === "profile" ||
      item.key === "change-password"
    ) {
      if (item.path) {
        navigate(item.path);
      }

      setOpen(false);
      return;
    }

    /*
     * Các chức năng Dashboard hiện tại tiếp tục dùng cơ chế
     * selectedMenu/onMenuSelect như trước.
     */
    if (onMenuSelect) {
      onMenuSelect(item.label);
    }

    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="mobile-menu-button"
        onClick={() => setOpen(!open)}
        aria-label="Mở menu"
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
              .filter(Boolean)
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
          {menuLoading && (
            <p style={{ padding: "8px 12px", fontSize: "13px" }}>
              Đang tải menu...
            </p>
          )}

          {!menuLoading && menuError && (
            <p
              style={{
                padding: "8px 12px",
                fontSize: "12px",
                lineHeight: 1.5,
              }}
            >
              {menuError}
            </p>
          )}

          {!menuLoading &&
            menu.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`sidebar-menu-item ${
                  selectedMenu === item.label ? "active" : ""
                }`}
                onClick={() => handleMenuClick(item)}
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