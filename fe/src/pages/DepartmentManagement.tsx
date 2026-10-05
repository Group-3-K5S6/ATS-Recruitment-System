import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import { clearLocalSession } from "../services/session";
import {
  createDepartment,
  deleteDepartment,
  loadDepartmentUsers,
  loadDepartments,
  setDepartmentActive,
  updateDepartment,
} from "../services/departmentApi";
import type {
  Department,
  DepartmentInput,
  DepartmentUser,
} from "../services/departmentApi";

function flattenDepartments(
  items: Department[],
  depth = 0,
): Array<{ department: Department; depth: number }> {
  return items.flatMap((department) => [
    { department, depth },
    ...flattenDepartments(department.children || [], depth + 1),
  ]);
}

function collectDepartmentIds(department: Department, ids: Set<string>) {
  ids.add(department.id);
  department.children?.forEach((child) => collectDepartmentIds(child, ids));
}

function DepartmentManagement() {
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<DepartmentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [busyDepartmentId, setBusyDepartmentId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);

  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );

  const [departmentName, setDepartmentName] = useState("");

  const [departmentCode, setDepartmentCode] = useState("");
  const [managerId, setManagerId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [parentId, setParentId] = useState("");
  const [saving, setSaving] = useState(false);

  const flattenedDepartments = flattenDepartments(departments);
  const approvers = users.filter((user) =>
    user.roles.some((role) => ["APPROVER", "HR_MANAGER", "ADMIN"].includes(role)),
  );
  const blockedParentIds = new Set<string>();
  if (editingDepartment) {
    const editingNode = flattenedDepartments.find(
      ({ department }) => department.id === editingDepartment.id,
    )?.department;
    if (editingNode) collectDepartmentIds(editingNode, blockedParentIds);
  }

  const fetchData = useCallback(async () => {
    const [departmentData, userData] = await Promise.all([
      loadDepartments(),
      loadDepartmentUsers(),
    ]);
    setDepartments(departmentData);
    setUsers(
      userData.filter(
        (user) => user.isActive && !user.roles.includes("CANDIDATE"),
      ),
    );
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setPageError("");
    try {
      await fetchData();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Không tải được dữ liệu phòng ban.",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    void Promise.all([loadDepartments(), loadDepartmentUsers()])
      .then(([departmentData, userData]) => {
        setDepartments(departmentData);
        setUsers(
          userData.filter(
            (user) => user.isActive && !user.roles.includes("CANDIDATE"),
          ),
        );
      })
      .catch((error: unknown) => {
        setPageError(
          error instanceof Error
            ? error.message
            : "Không tải được dữ liệu phòng ban.",
        );
      })
      .finally(() => setLoading(false));
  }, [fetchData]);

  const handleLogout = async () => {
    clearLocalSession();
    navigate("/login");
  };

  const handleMenuSelect = (label: string) => {
    if (label === "Tổng quan") {
      navigate("/dashboard");
      return;
    }

    if (label === "Phòng ban & tổ chức") {
      navigate("/departments");
      return;
    }

    if (label === "Chức danh & dải lương") {
      navigate("/job-titles");
      return;
    }

    if (label === "Hồ sơ cá nhân") {
      navigate("/profile");
      return;
    }
  };

  const openAddModal = (nextParentId = "") => {
    setEditingDepartment(null);
    setDepartmentName("");
    setDepartmentCode("");
    setManagerId("");
    setApproverId("");
    setParentId(nextParentId);
    setShowModal(true);
  };

  const openEditModal = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentName(department.name);
    setDepartmentCode(department.code);
    setManagerId(department.managerId || "");
    setApproverId(department.approverId || "");
    setParentId(department.parentId || "");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDepartment(null);
    setDepartmentName("");
    setDepartmentCode("");
    setManagerId("");
    setApproverId("");
    setParentId("");
  };

  const handleSaveDepartment = async () => {
    if (
      departmentName.trim().length < 2 ||
      !/^[A-Z0-9_-]{2,30}$/.test(departmentCode.trim()) ||
      !managerId ||
      !approverId
    ) {
      alert(
        "Vui lòng nhập tên từ 2 ký tự, mã hợp lệ, người phụ trách và người duyệt.",
      );
      return;
    }

    const input: DepartmentInput = {
      name: departmentName.trim(),
      code: departmentCode.trim(),
      managerId,
      approverId,
      parentId: parentId || null,
    };

    setSaving(true);
    try {
      if (editingDepartment) {
        await updateDepartment(editingDepartment.id, input);
      } else {
        await createDepartment(input);
      }
      closeModal();
      await loadData();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Không lưu được phòng ban.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDisableDepartment = async (id: string) => {
    setBusyDepartmentId(id);
    try {
      await setDepartmentActive(id, false);
      await loadData();
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Không thể ngừng áp dụng phòng ban.",
      );
    } finally {
      setBusyDepartmentId(null);
    }
  };

  const handleDeleteDepartment = async (department: Department) => {
    // Không cho xóa nếu đang có yêu cầu tuyển dụng mở
    if (department.hasOpenRequisition) {
      alert(
        "Phòng ban đang có yêu cầu tuyển dụng mở nên không thể xóa. Chỉ có thể ngừng áp dụng.",
      );
      return;
    }

    // Không cho xóa nếu còn phòng ban con
    if (department.children && department.children.length > 0) {
      alert("Phòng ban đang có đơn vị trực thuộc nên không thể xóa.");
      return;
    }

    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa "${department.name}" không?`,
    );

    if (!confirmed) {
      return;
    }

    setBusyDepartmentId(department.id);
    try {
      await deleteDepartment(department.id);
      await loadData();
    } catch (error) {
      alert(
        error instanceof Error ? error.message : "Không thể xóa phòng ban.",
      );
    } finally {
      setBusyDepartmentId(null);
    }
  };

  const renderDepartment = (department: Department, level = 0) => {
    return (
      <div
        key={department.id}
        style={{
          marginLeft: level === 0 ? "0" : "28px",
          marginTop: "14px",
        }}
      >
        <div
          style={{
            border: "1px solid #dfe5e2",
            borderRadius: "10px",
            padding: "18px",
            backgroundColor: department.active ? "#ffffff" : "#f4f5f5",
            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "18px",
                  color: "#24332d",
                }}
              >
                {department.name}
              </h3>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#66756e",
                  fontSize: "14px",
                }}
              >
                Người phụ trách: <strong>{department.manager || "Chưa gán"}</strong>
              </p>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#66756e",
                  fontSize: "14px",
                }}
              >
                Người duyệt: <strong>{department.approverName || "Chưa cấu hình"}</strong>
              </p>

              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "13px",
                }}
              >
                Trạng thái:{" "}
                <span
                  style={{
                    color: department.active ? "#1f7a4f" : "#9b5c28",
                    fontWeight: 600,
                  }}
                >
                  {department.active ? "Đang hoạt động" : "Ngừng áp dụng"}
                </span>
              </p>

              {department.hasOpenRequisition && (
                <p
                  style={{
                    margin: "8px 0 0",
                    color: "#b45309",
                    fontSize: "12px",
                  }}
                >
                  Có yêu cầu tuyển dụng đang mở
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => openEditModal(department)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #cfd8d3",
                  borderRadius: "6px",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Sửa
              </button>

              {department.active && (
                <button
                  type="button"
                  disabled={busyDepartmentId === department.id}
                  onClick={() => void handleDisableDepartment(department.id)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #e5c07b",
                    borderRadius: "6px",
                    background: "#fff8e8",
                    color: "#9a6200",
                    cursor: "pointer",
                  }}
                >
                  {busyDepartmentId === department.id ? "Đang xử lý…" : "Ngừng áp dụng"}
                </button>
              )}

              <button
                type="button"
                disabled={
                  department.hasOpenRequisition ||
                  Boolean(department.children && department.children.length > 0) ||
                  busyDepartmentId === department.id
                }
                onClick={() => void handleDeleteDepartment(department)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #efb5b5",
                  borderRadius: "6px",

                  background:
                    department.hasOpenRequisition ||
                    Boolean(
                      department.children && department.children.length > 0,
                    )
                      ? "#f3f4f4"
                      : "#fff1f1",

                  color:
                    department.hasOpenRequisition ||
                    Boolean(
                      department.children && department.children.length > 0,
                    )
                      ? "#9ca3a0"
                      : "#b42318",

                  cursor:
                    department.hasOpenRequisition ||
                    Boolean(
                      department.children && department.children.length > 0,
                    )
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Xóa
              </button>
            </div>
          </div>
        </div>

        {department.children && department.children.length > 0 && (
          <div
            style={{
              borderLeft: "2px solid #d7e5de",
              marginLeft: "20px",
              paddingLeft: "8px",
            }}
          >
            {department.children.map((child) =>
              renderDepartment(child, level + 1),
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role="HRManager"
        userName="HR Manager User"
        onLogout={handleLogout}
        selectedMenu="Phòng ban & tổ chức"
        onMenuSelect={handleMenuSelect}
      />

      <main className="dashboard-content">
        <div
          style={{
            padding: "32px",
            maxWidth: "1100px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "20px",
              marginBottom: "26px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: "28px",
                  color: "#24332d",
                }}
              >
                Phòng ban & sơ đồ tổ chức
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#6f7d76",
                }}
              >
                Quản lý cơ cấu phòng ban, người phụ trách và trạng thái hoạt
                động.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openAddModal()}
              style={{
                padding: "10px 16px",
                border: "none",
                borderRadius: "7px",
                background: "#267553",
                color: "#ffffff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Thêm phòng ban
            </button>
          </div>

          {pageError && (
            <div
              role="alert"
              style={{
                marginBottom: "18px",
                padding: "12px 14px",
                border: "1px solid #f0b7b7",
                borderRadius: "8px",
                background: "#fff4f4",
                color: "#a32828",
              }}
            >
              {pageError}{" "}
              <button type="button" onClick={() => void loadData()}>
                Thử lại
              </button>
            </div>
          )}

          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e1e7e4",
              borderRadius: "12px",
              padding: "22px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                marginBottom: "20px",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                  color: "#2d3d35",
                }}
              >
                Cây tổ chức
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#7c8983",
                  fontSize: "13px",
                }}
              >
                Hiển thị phòng ban theo cấu trúc nhiều cấp.
              </p>
            </div>

            {loading ? (
              <p role="status" style={{ color: "#66756e" }}>
                Đang tải dữ liệu phòng ban…
              </p>
            ) : departments.length > 0 ? (
              departments.map((department) => renderDepartment(department))
            ) : (
              <p style={{ color: "#66756e" }}>
                Chưa có phòng ban. Hãy thêm phòng ban đầu tiên.
              </p>
            )}
          </section>
        </div>
      </main>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            overflowY: "auto",
            padding: "16px",
          }}
        >
          <div
            style={{
              width: "420px",
              maxWidth: "calc(100vw - 32px)",
              maxHeight: "calc(100vh - 32px)",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#24332d",
              }}
            >
              {editingDepartment ? "Sửa phòng ban" : "Thêm phòng ban"}
            </h2>

            <div
              style={{
                marginTop: "20px",
              }}
            >
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Tên phòng ban
              </label>

              <input
                type="text"
                value={departmentName}
                onChange={(event) => setDepartmentName(event.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                }}
              />
            </div>

            <div
              style={{
                marginTop: "16px",
              }}
            >
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Mã phòng ban
              </label>

              <input
                type="text"
                value={departmentCode}
                onChange={(event) => setDepartmentCode(event.target.value.toUpperCase())}
                maxLength={30}
                pattern="[A-Z0-9_-]+"
                placeholder="Ví dụ: HR, ENG"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                }}
              />
            </div>

            <div style={{ marginTop: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Đơn vị cấp trên
              </label>
              <select
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                  background: "#ffffff",
                }}
              >
                <option value="">Không có (cấp gốc)</option>
                {flattenedDepartments
                  .filter(
                    ({ department }) =>
                      department.active && !blockedParentIds.has(department.id),
                  )
                  .map(({ department, depth }) => (
                    <option key={department.id} value={department.id}>
                      {"　".repeat(depth)}{department.name} ({department.code})
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Người phụ trách
              </label>
              <select
                value={managerId}
                onChange={(event) => setManagerId(event.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                  background: "#ffffff",
                }}
              >
                <option value="">Chọn nhân sự</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} — {user.email}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: "16px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                }}
              >
                Người duyệt yêu cầu tuyển dụng
              </label>
              <select
                value={approverId}
                onChange={(event) => setApproverId(event.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 12px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                  background: "#ffffff",
                }}
              >
                <option value="">Chọn người duyệt</option>
                {approvers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} — {user.email}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                style={{
                  padding: "9px 14px",
                  border: "1px solid #ccd7d1",
                  borderRadius: "6px",
                  background: "#ffffff",
                  cursor: "pointer",
                }}
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={() => void handleSaveDepartment()}
                disabled={saving}
                style={{
                  padding: "9px 14px",
                  border: "none",
                  borderRadius: "6px",
                  background: "#267553",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {saving
                  ? "Đang lưu…"
                  : editingDepartment
                    ? "Lưu thay đổi"
                    : "Thêm phòng ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DepartmentManagement;
