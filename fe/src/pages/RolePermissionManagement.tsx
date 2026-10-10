import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createPermission,
  getPermissions,
  getRoles,
  updateRolePermissions,
} from "../services/rbacApi";

import type {
  Permission,
  RoleWithPermissions,
} from "../services/rbacApi";

type PermissionForm = {
  code: string;
  module: string;
  description: string;
};

const roleLabels: Record<string, string> = {
  RECRUITER: "Nhân viên tuyển dụng",
  HIRING_MANAGER: "Trưởng bộ phận",
  INTERVIEWER: "Người phỏng vấn",
  HR_MANAGER: "Trưởng phòng Nhân sự",
  APPROVER: "Người duyệt",
  ADMIN: "Quản trị hệ thống",
  CANDIDATE: "Ứng viên",
};

export default function RolePermissionManagement() {
  const [roles, setRoles] = useState<
    RoleWithPermissions[]
  >([]);

  const [permissions, setPermissions] =
    useState<Permission[]>([]);

  const [selectedPermissions, setSelectedPermissions] =
    useState<Record<string, Set<string>>>({});

  const [loading, setLoading] =
    useState(true);

  const [savingRoleId, setSavingRoleId] =
    useState<string | null>(null);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const [showCreateForm, setShowCreateForm] =
    useState(false);

  const [permissionForm, setPermissionForm] =
    useState<PermissionForm>({
      code: "",
      module: "",
      description: "",
    });

  const [creatingPermission, setCreatingPermission] =
    useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      const [
        roleData,
        permissionData,
      ] = await Promise.all([
        getRoles(),
        getPermissions(),
      ]);

      setRoles(roleData);
      setPermissions(permissionData);

      const mapping: Record<
        string,
        Set<string>
      > = {};

      for (const role of roleData) {
        mapping[role.id] = new Set(
          role.permissions.map(
            (permission) => permission.id,
          ),
        );
      }

      setSelectedPermissions(mapping);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không tải được dữ liệu phân quyền.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const groupedPermissions =
    useMemo(() => {
      const result: Record<
        string,
        Permission[]
      > = {};

      for (const permission of permissions) {
        if (!result[permission.module]) {
          result[permission.module] = [];
        }

        result[permission.module].push(
          permission,
        );
      }

      return result;
    }, [permissions]);

  const togglePermission = (
    role: RoleWithPermissions,
    permissionId: string,
  ) => {
    if (role.isSystemAdmin) {
      return;
    }

    setSelectedPermissions(
      (current) => {
        const next = {
          ...current,
        };

        const rolePermissions =
          new Set(
            next[role.id] || [],
          );

        if (
          rolePermissions.has(
            permissionId,
          )
        ) {
          rolePermissions.delete(
            permissionId,
          );
        } else {
          rolePermissions.add(
            permissionId,
          );
        }

        next[role.id] =
          rolePermissions;

        return next;
      },
    );

    setSuccessMessage("");
  };

  const saveRole = async (
    role: RoleWithPermissions,
  ) => {
    if (role.isSystemAdmin) {
      return;
    }

    try {
      setSavingRoleId(role.id);
      setError("");
      setSuccessMessage("");

      const permissionIds =
        Array.from(
          selectedPermissions[
            role.id
          ] || [],
        );

      await updateRolePermissions(
        role.id,
        permissionIds,
      );

      setSuccessMessage(
        `Đã lưu quyền cho ${
          roleLabels[role.name] ||
          role.name
        }.`,
      );

      await loadData();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không lưu được phân quyền.",
      );
    } finally {
      setSavingRoleId(null);
    }
  };

  const handleCreatePermission =
    async () => {
      const code =
        permissionForm.code
          .trim()
          .toLowerCase();

      const module =
        permissionForm.module
          .trim()
          .toLowerCase();

      const description =
        permissionForm.description.trim();

      if (
        !code ||
        !module ||
        !description
      ) {
        setError(
          "Vui lòng nhập đầy đủ thông tin quyền.",
        );
        return;
      }

      try {
        setCreatingPermission(true);
        setError("");
        setSuccessMessage("");

        await createPermission({
          code,
          module,
          description,
        });

        setPermissionForm({
          code: "",
          module: "",
          description: "",
        });

        setShowCreateForm(false);

        setSuccessMessage(
          "Tạo quyền mới thành công.",
        );

        await loadData();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Không tạo được quyền.",
        );
      } finally {
        setCreatingPermission(false);
      }
    };

  return (
    <div className="rbac-page">
      <div className="rbac-header">
        <div>
          <h1>Vai trò & quyền</h1>

          <p>
            Quản lý ma trận phân quyền của
            các vai trò trong hệ thống.
          </p>
        </div>

        <button
          type="button"
          className="rbac-primary-button"
          onClick={() =>
            setShowCreateForm(true)
          }
        >
          + Tạo quyền mới
        </button>
      </div>

      {error && (
        <div className="rbac-alert rbac-error">
          {error}
        </div>
      )}

      {successMessage && (
        <div className="rbac-alert rbac-success">
          {successMessage}
        </div>
      )}

      {loading ? (
        <div className="rbac-loading">
          Đang tải ma trận phân quyền...
        </div>
      ) : (
        <div className="rbac-table-wrapper">
          <table className="rbac-table">
            <thead>
              <tr>
                <th className="rbac-permission-column">
                  Quyền
                </th>

                {roles.map((role) => (
                  <th key={role.id}>
                    {roleLabels[
                      role.name
                    ] || role.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {Object.entries(
                groupedPermissions,
              ).map(
                ([
                  module,
                  modulePermissions,
                ]) => (
                  <>
                    <tr
                      key={`module-${module}`}
                      className="rbac-module-row"
                    >
                      <td
                        colSpan={
                          roles.length + 1
                        }
                      >
                        {module.toUpperCase()}
                      </td>
                    </tr>

                    {modulePermissions.map(
                      (permission) => (
                        <tr
                          key={
                            permission.id
                          }
                        >
                          <td className="rbac-permission-info">
                            <strong>
                              {
                                permission.description
                              }
                            </strong>

                            <span>
                              {
                                permission.code
                              }
                            </span>
                          </td>

                          {roles.map(
                            (role) => {
                              const checked =
                                role.isSystemAdmin ||
                                selectedPermissions[
                                  role.id
                                ]?.has(
                                  permission.id,
                                ) === true;

                              return (
                                <td
                                  key={`${role.id}-${permission.id}`}
                                  className="rbac-check-cell"
                                >
                                  {role.isSystemAdmin ? (
                                    <span className="rbac-admin-lock">
                                      Toàn quyền
                                    </span>
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={
                                        checked
                                      }
                                      onChange={() =>
                                        togglePermission(
                                          role,
                                          permission.id,
                                        )
                                      }
                                    />
                                  )}
                                </td>
                              );
                            },
                          )}
                        </tr>
                      ),
                    )}
                  </>
                ),
              )}
            </tbody>

            <tfoot>
              <tr>
                <td>
                  <strong>
                    Lưu thay đổi
                  </strong>
                </td>

                {roles.map((role) => (
                  <td
                    key={role.id}
                    className="rbac-check-cell"
                  >
                    {role.isSystemAdmin ? (
                      <span className="rbac-admin-lock">
                        🔒
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rbac-save-button"
                        disabled={
                          savingRoleId ===
                          role.id
                        }
                        onClick={() =>
                          void saveRole(
                            role,
                          )
                        }
                      >
                        {savingRoleId ===
                        role.id
                          ? "Đang lưu..."
                          : "Lưu"}
                      </button>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {showCreateForm && (
        <div className="rbac-modal-overlay">
          <div className="rbac-modal">
            <h2>Tạo quyền mới</h2>

            <label>
              Mã quyền
            </label>

            <input
              value={
                permissionForm.code
              }
              placeholder="Ví dụ: candidates:export"
              onChange={(event) =>
                setPermissionForm(
                  (current) => ({
                    ...current,
                    code: event.target.value,
                  }),
                )
              }
            />

            <label>
              Nhóm chức năng
            </label>

            <input
              value={
                permissionForm.module
              }
              placeholder="Ví dụ: candidates"
              onChange={(event) =>
                setPermissionForm(
                  (current) => ({
                    ...current,
                    module:
                      event.target.value,
                  }),
                )
              }
            />

            <label>
              Tên / mô tả quyền
            </label>

            <textarea
              rows={3}
              value={
                permissionForm.description
              }
              placeholder="Ví dụ: Xuất danh sách ứng viên"
              onChange={(event) =>
                setPermissionForm(
                  (current) => ({
                    ...current,
                    description:
                      event.target.value,
                  }),
                )
              }
            />

            <div className="rbac-modal-actions">
              <button
                type="button"
                className="rbac-secondary-button"
                onClick={() =>
                  setShowCreateForm(
                    false,
                  )
                }
              >
                Hủy
              </button>

              <button
                type="button"
                className="rbac-primary-button"
                disabled={
                  creatingPermission
                }
                onClick={() =>
                  void handleCreatePermission()
                }
              >
                {creatingPermission
                  ? "Đang tạo..."
                  : "Tạo quyền"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}