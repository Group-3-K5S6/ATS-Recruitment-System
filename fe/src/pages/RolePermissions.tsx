import { useState } from "react";
import type { Role } from "../data/roleMenus";
import "../App.css";

type Permission = {
  module: string;
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
};

const roleLabels: Record<Role, string> = {
  Candidate: "Ứng viên",
  Recruiter: "Nhân viên tuyển dụng",
  HiringManager: "Trưởng bộ phận",
  Interviewer: "Người phỏng vấn",
  HRManager: "Trưởng phòng Nhân sự",
  Approver: "Người duyệt",
  Admin: "Quản trị hệ thống",
};

const initialPermissions: Record<Role, Permission[]> = {
  Candidate: [
    {
      module: "Vị trí tuyển dụng",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Hồ sơ ứng tuyển",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Lịch phỏng vấn",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Offer",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
  ],
  Recruiter: [
    {
      module: "Yêu cầu tuyển dụng",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Ứng viên",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Pipeline tuyển dụng",
      view: true,
      create: false,
      edit: true,
      delete: false,
    },
    {
      module: "Lịch phỏng vấn",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Offer",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
  ],

  HiringManager: [
    {
      module: "Yêu cầu tuyển dụng",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Ứng viên",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Quyết định tuyển",
      view: true,
      create: false,
      edit: true,
      delete: false,
    },
  ],

  Interviewer: [
    {
      module: "Lịch phỏng vấn",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Ứng viên được phân công",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Phiếu đánh giá",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
  ],

  HRManager: [
    {
      module: "Vị trí tuyển dụng",
      view: true,
      create: true,
      edit: true,
      delete: true,
    },
    {
      module: "Phân công Recruiter",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Headcount & ngân sách",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
    {
      module: "Báo cáo",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
  ],

  Approver: [
    {
      module: "Yêu cầu tuyển dụng",
      view: true,
      create: false,
      edit: true,
      delete: false,
    },
    {
      module: "Offer",
      view: true,
      create: false,
      edit: true,
      delete: false,
    },
    {
      module: "Lịch sử phê duyệt",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
  ],

  Admin: [
    {
      module: "Quản lý tài khoản",
      view: true,
      create: true,
      edit: true,
      delete: true,
    },
    {
      module: "Vai trò & quyền",
      view: true,
      create: true,
      edit: true,
      delete: true,
    },
    {
      module: "Danh mục hệ thống",
      view: true,
      create: true,
      edit: true,
      delete: true,
    },
    {
      module: "Nhật ký hệ thống",
      view: true,
      create: false,
      edit: false,
      delete: false,
    },
    {
      module: "Cấu hình",
      view: true,
      create: true,
      edit: true,
      delete: false,
    },
  ],
};

function RolePermissions() {
  const [selectedRole, setSelectedRole] = useState<Role>("Admin");

  const [permissions, setPermissions] = useState(initialPermissions);

  const handlePermissionChange = (
    role: Role,
    index: number,
    field: keyof Omit<Permission, "module">,
  ) => {
    setPermissions((current) => {
      const newPermissions = {
        ...current,
      };

      const rolePermissions = [...newPermissions[role]];

      rolePermissions[index] = {
        ...rolePermissions[index],
        [field]: !rolePermissions[index][field],
      };

      newPermissions[role] = rolePermissions;

      return newPermissions;
    });
  };

  const handleSave = () => {
    alert(`Đã lưu phân quyền cho ${roleLabels[selectedRole]}`);
  };

  return (
    <div className="role-permission-page">
      <div className="role-permission-header">
        <div>
          <h1>Phân quyền theo vai trò</h1>
          <p>Quản lý quyền truy cập các chức năng trong hệ thống.</p>
        </div>

        <button className="save-permission-button" onClick={handleSave}>
          Lưu thay đổi
        </button>
      </div>

      <div className="role-permission-layout">
        <aside className="role-list-panel">
          <h2>Danh sách vai trò</h2>

          {(Object.keys(roleLabels) as Role[]).map((role) => (
            <button
              key={role}
              className={`role-item ${selectedRole === role ? "active" : ""}`}
              onClick={() => setSelectedRole(role)}
            >
              <span>{roleLabels[role]}</span>

              <small>{role}</small>
            </button>
          ))}
        </aside>

        <section className="permission-panel">
          <div className="permission-panel-header">
            <div>
              <h2>Quyền của vai trò</h2>

              <p>{roleLabels[selectedRole]}</p>
            </div>
          </div>

          <div className="permission-table-wrapper">
            <table className="permission-table">
              <thead>
                <tr>
                  <th>Module / Chức năng</th>
                  <th>Xem</th>
                  <th>Thêm</th>
                  <th>Sửa</th>
                  <th>Xóa</th>
                </tr>
              </thead>

              <tbody>
                {permissions[selectedRole].map((permission, index) => (
                  <tr key={permission.module}>
                    <td>{permission.module}</td>

                    <td>
                      <input
                        type="checkbox"
                        checked={permission.view}
                        onChange={() =>
                          handlePermissionChange(selectedRole, index, "view")
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="checkbox"
                        checked={permission.create}
                        onChange={() =>
                          handlePermissionChange(selectedRole, index, "create")
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="checkbox"
                        checked={permission.edit}
                        onChange={() =>
                          handlePermissionChange(selectedRole, index, "edit")
                        }
                      />
                    </td>

                    <td>
                      <input
                        type="checkbox"
                        checked={permission.delete}
                        onChange={() =>
                          handlePermissionChange(selectedRole, index, "delete")
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="permission-note">
            <strong>Lưu ý:</strong> Các quyền trên hiện đang là dữ liệu giao
            diện. Việc kiểm tra quyền thực tế ở tầng server sẽ do Backend xử lý.
          </div>
        </section>
      </div>
    </div>
  );
}

export default RolePermissions;
