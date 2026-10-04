import { useCallback, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import {
  assignRole,
  loadAvailableRoles,
  loadRoleUsers,
  revokeRole,
} from "../services/roleApi";
import type { RoleUser } from "../services/roleApi";

const roleLabels: Record<string, string> = {
  CANDIDATE: "Ứng viên",
  RECRUITER: "Nhân viên tuyển dụng",
  HIRING_MANAGER: "Trưởng bộ phận",
  INTERVIEWER: "Người phỏng vấn",
  HR_MANAGER: "Trưởng phòng Nhân sự",
  APPROVER: "Người duyệt",
  ADMIN: "Quản trị hệ thống",
};

function RoleAssignment() {
  const [users, setUsers] = useState<RoleUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextUsers, availableRoles] = await Promise.all([
        loadRoleUsers(),
        loadAvailableRoles(),
      ]);
      setUsers(nextUsers);
      setRoles(availableRoles);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không tải được dữ liệu vai trò.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAssign = async (user: RoleUser) => {
    const role = selectedRoles[user.id];
    if (!role) {
      setError("Vui lòng chọn vai trò cần gán.");
      return;
    }
    setBusyKey(`${user.id}:${role}`);
    setError("");
    setNotice("");
    try {
      await assignRole(user.id, role);
      setSelectedRoles((current) => ({ ...current, [user.id]: "" }));
      setNotice(`Đã gán vai trò ${roleLabels[role] || role} cho ${user.fullName}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể gán vai trò.");
    } finally {
      setBusyKey("");
    }
  };

  const handleRevoke = async (user: RoleUser, role: string) => {
    if (!window.confirm(`Thu hồi vai trò “${roleLabels[role] || role}” của ${user.fullName}?`)) return;
    setBusyKey(`${user.id}:${role}`);
    setError("");
    setNotice("");
    try {
      await revokeRole(user.id, role);
      setNotice(`Đã thu hồi vai trò ${roleLabels[role] || role} của ${user.fullName}.`);
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể thu hồi vai trò.");
    } finally {
      setBusyKey("");
    }
  };

  const handleRoleSelect = (userId: string, event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedRoles((current) => ({ ...current, [userId]: event.target.value }));
  };

  return (
    <section style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#172B4D" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Phân bổ và thu hồi vai trò</h2>
          <p style={{ color: "#5E6C84", fontSize: 14 }}>
            Quản lý vai trò của người dùng ATS. Thay đổi được lưu vào hệ thống ngay lập tức.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      {error && <p role="alert" style={{ padding: 12, color: "#B42318", background: "#FEF3F2" }}>{error}</p>}
      {notice && <p role="status" style={{ padding: 12, color: "#067647", background: "#ECFDF3" }}>{notice}</p>}

      {loading ? <p>Đang tải người dùng và vai trò…</p> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, background: "#fff" }}>
            <thead>
              <tr style={{ background: "#F4F5F7", textAlign: "left" }}>
                <th style={{ padding: 12 }}>Họ và tên</th>
                <th style={{ padding: 12 }}>Email</th>
                <th style={{ padding: 12 }}>Phòng ban</th>
                <th style={{ padding: 12 }}>Vai trò hiện tại</th>
                <th style={{ padding: 12 }}>Gán vai trò</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid #E1E6EB" }}>
                  <td style={{ padding: 12 }}>
                    <strong>{user.fullName}</strong>
                    <div style={{ color: user.isActive ? "#067647" : "#B42318", fontSize: 12 }}>
                      {user.isActive ? "Hoạt động" : "Đã khóa"}
                    </div>
                  </td>
                  <td style={{ padding: 12 }}>{user.email}</td>
                  <td style={{ padding: 12 }}>{user.department || "—"}</td>
                  <td style={{ padding: 12, minWidth: 250 }}>
                    {user.roles.length ? user.roles.map((role) => (
                      <span key={role} style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "3px 6px 3px 0", padding: "5px 8px", borderRadius: 14, background: "#E3FCEF", color: "#006644", fontSize: 12 }}>
                        {roleLabels[role] || role}
                        <button
                          type="button"
                          aria-label={`Thu hồi ${roleLabels[role] || role} của ${user.fullName}`}
                          title="Thu hồi vai trò"
                          disabled={busyKey === `${user.id}:${role}`}
                          onClick={() => void handleRevoke(user, role)}
                          style={{ border: 0, padding: 0, color: "#B42318", background: "transparent", cursor: "pointer" }}
                        >×</button>
                      </span>
                    )) : <span style={{ color: "#B42318" }}>Chưa được gán vai trò</span>}
                  </td>
                  <td style={{ padding: 12, minWidth: 245 }}>
                    <select
                      value={selectedRoles[user.id] || ""}
                      onChange={(event) => handleRoleSelect(user.id, event)}
                      aria-label={`Chọn vai trò cho ${user.fullName}`}
                    >
                      <option value="">-- Chọn vai trò --</option>
                      {roles.filter((role) => !user.roles.includes(role)).map((role) => (
                        <option key={role} value={role}>{roleLabels[role] || role}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedRoles[user.id] || busyKey.startsWith(`${user.id}:`)}
                      onClick={() => void handleAssign(user)}
                      style={{ marginLeft: 8 }}
                    >
                      Gán
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} style={{ padding: 20, textAlign: "center" }}>Chưa có tài khoản nào.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default RoleAssignment;
