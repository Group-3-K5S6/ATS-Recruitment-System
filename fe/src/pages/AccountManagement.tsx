import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FileSpreadsheet } from "lucide-react";

import EmployeeImportModal from "../components/EmployeeImportModal";

const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type AccountStatus = "Hoạt động" | "Đã khóa";

type Account = {
  id: string;
  name: string;
  email: string;
  department: string;
  roles: string[];
  role: string;
  status: AccountStatus;
};

type BackendUser = {
  id: string;
  email: string;
  fullName: string;
  departmentId?: string | null;

  department?: {
    id?: string;
    name?: string;
  } | null;

  isActive: boolean;
  createdAt?: string;
  roles: string[];
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;

  error?: {
    message?: string;
    code?: string;
  };
};

type AccountForm = {
  name: string;
  email: string;
  password: string;
  role: string;
};

const PAGE_SIZE = 20;

const ROLE_OPTIONS = [
  {
    value: "CANDIDATE",
    label: "Ứng viên",
  },
  {
    value: "RECRUITER",
    label: "Nhân viên tuyển dụng",
  },
  {
    value: "HIRING_MANAGER",
    label: "Trưởng bộ phận",
  },
  {
    value: "INTERVIEWER",
    label: "Người phỏng vấn",
  },
  {
    value: "HR_MANAGER",
    label: "Trưởng phòng Nhân sự",
  },
  {
    value: "APPROVER",
    label: "Người duyệt",
  },
  {
    value: "ADMIN",
    label: "Quản trị hệ thống",
  },
];

const ROLE_LABELS: Record<string, string> = {
  CANDIDATE: "Ứng viên",
  RECRUITER: "Nhân viên tuyển dụng",
  HIRING_MANAGER: "Trưởng bộ phận",
  INTERVIEWER: "Người phỏng vấn",
  HR_MANAGER: "Trưởng phòng Nhân sự",
  APPROVER: "Người duyệt",
  ADMIN: "Quản trị hệ thống",
};

function getAccessToken() {
  return sessionStorage.getItem("accessToken");
}

function roleLabel(role: string) {
  return ROLE_LABELS[role] || role;
}

function getApiMessage(
  result: ApiResponse<unknown>,
  fallback: string,
) {
  return result.error?.message || result.message || fallback;
}

const AccountManagement = () => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [formMode, setFormMode] = useState<
    "create" | "edit" | null
  >(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<AccountForm>({
    name: "",
    email: "",
    password: "",
    role: "INTERVIEWER",
  });

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [selectedAccount, setSelectedAccount] =
    useState<Account | null>(null);

  const [accountAction, setAccountAction] = useState<
    "lock" | "unlock" | null
  >(null);

  const [lockError, setLockError] = useState("");

  /* =====================================================
     LOAD ACCOUNT
  ===================================================== */

  const loadAccounts = async () => {
    const token = getAccessToken();

    if (!token) {
      throw new Error(
        "Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.",
      );
    }

    const response = await fetch(`${API_URL}/api/users`, {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result =
      (await response.json()) as ApiResponse<BackendUser[]>;

    if (
      !response.ok ||
      !result.success ||
      !Array.isArray(result.data)
    ) {
      throw new Error(
        getApiMessage(
          result,
          "Không tải được danh sách tài khoản.",
        ),
      );
    }

    const mapped: Account[] = result.data.map((user) => {
      const roles = Array.isArray(user.roles)
        ? user.roles
        : [];

      return {
        id: user.id,
        name: user.fullName,
        email: user.email,

        department:
          user.department?.name || "Chưa gán phòng ban",

        roles,

        role:
          roles.length > 0
            ? roles.map(roleLabel).join(", ")
            : "Chưa có vai trò",

        status: user.isActive
          ? "Hoạt động"
          : "Đã khóa",
      };
    });

    setAccounts(mapped);
  };

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setPageError("");

        await loadAccounts();
      } catch (error) {
        setPageError(
          error instanceof Error
            ? error.message
            : "Không tải được dữ liệu.",
        );
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  /* =====================================================
     FILTER
  ===================================================== */

  const keyword = searchText.trim().toLowerCase();

  const filteredAccounts = accounts.filter((account) => {
    const matchesKeyword =
      keyword === "" ||
      account.name.toLowerCase().includes(keyword) ||
      account.email.toLowerCase().includes(keyword) ||
      account.department.toLowerCase().includes(keyword);

    const matchesRole =
      roleFilter === "" ||
      account.roles.includes(roleFilter);

    const matchesStatus =
      statusFilter === "" ||
      account.status === statusFilter;

    return (
      matchesKeyword &&
      matchesRole &&
      matchesStatus
    );
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAccounts.length / PAGE_SIZE),
  );

  const page = Math.min(currentPage, totalPages);

  const startIndex =
    (page - 1) * PAGE_SIZE;

  const displayedAccounts =
    filteredAccounts.slice(
      startIndex,
      startIndex + PAGE_SIZE,
    );

  /* =====================================================
     FORM
  ===================================================== */

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      password: "",
      role: "INTERVIEWER",
    });
  };

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);

    resetForm();

    setFormError("");
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingId(null);

    resetForm();

    setFormError("");
  };

  const openEditForm = (account: Account) => {
    setFormMode("edit");

    setEditingId(account.id);

    setForm({
      name: account.name,
      email: account.email,
      password: "",
      role: account.roles[0] || "INTERVIEWER",
    });

    setFormError("");
  };

  const handleSearchChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setSearchText(event.target.value);
    setCurrentPage(1);
  };

  const handleRoleChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    setRoleFilter(event.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (
    event: ChangeEvent<HTMLSelectElement>,
  ) => {
    setStatusFilter(event.target.value);
    setCurrentPage(1);
  };

  /* =====================================================
     CREATE ACCOUNT
  ===================================================== */

  const createAccount = async () => {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Phiên đăng nhập không tồn tại.");
    }

    const response = await fetch(`${API_URL}/api/users`, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },

      body: JSON.stringify({
        email: form.email.trim().toLowerCase(),
        password: form.password,
        fullName: form.name.trim(),

        roles: [
          form.role,
        ],
      }),
    });

    const result =
      (await response.json()) as ApiResponse<BackendUser>;

    if (!response.ok || !result.success) {
      throw new Error(
        getApiMessage(
          result,
          "Không tạo được tài khoản.",
        ),
      );
    }
  };

  /* =====================================================
     UPDATE ACCOUNT
  ===================================================== */

  const updateAccount = async (
    id: string,
  ) => {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Phiên đăng nhập không tồn tại.");
    }

    const response = await fetch(
      `${API_URL}/api/users/${id}`,
      {
        method: "PUT",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          fullName: form.name.trim(),
        }),
      },
    );

    const result =
      (await response.json()) as ApiResponse<BackendUser>;

    if (!response.ok || !result.success) {
      throw new Error(
        getApiMessage(
          result,
          "Không cập nhật được tài khoản.",
        ),
      );
    }
  };

  /* =====================================================
     SUBMIT
  ===================================================== */

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setFormError("");

    const name = form.name.trim();

    const email =
      form.email.trim().toLowerCase();

    if (!name || !email) {
      setFormError(
        "Vui lòng nhập đầy đủ họ tên và email.",
      );

      return;
    }

    const duplicateEmail = accounts.some(
      (account) =>
        account.email.toLowerCase() === email &&
        account.id !== editingId,
    );

    if (duplicateEmail) {
      setFormError(
        `Email "${email}" đã tồn tại trong hệ thống.`,
      );

      return;
    }

    if (formMode === "create") {
      if (!form.password || !form.role) {
        setFormError(
          "Vui lòng nhập mật khẩu và chọn vai trò.",
        );

        return;
      }

      if (form.password.length < 6) {
        setFormError(
          "Mật khẩu phải có ít nhất 6 ký tự.",
        );

        return;
      }
    }

    try {
      setSubmitting(true);

      if (formMode === "create") {
        await createAccount();
      }

      if (
        formMode === "edit" &&
        editingId
      ) {
        await updateAccount(editingId);
      }

      await loadAccounts();

      closeForm();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* =====================================================
     LOCK
  ===================================================== */

  const openLockDialog = (
    account: Account,
  ) => {
    setSelectedAccount(account);

    setAccountAction("lock");

    setLockError("");
  };

  const openUnlockDialog = (
    account: Account,
  ) => {
    setSelectedAccount(account);

    setAccountAction("unlock");

    setLockError("");
  };

  const closeAccountAction = () => {
    setSelectedAccount(null);
    setAccountAction(null);

    setLockError("");
  };

  const confirmLockAccount =
    async () => {
      if (!selectedAccount) {
        return;
      }

      const token = getAccessToken();

      if (!token) {
        setLockError(
          "Phiên đăng nhập không tồn tại.",
        );

        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/users/${selectedAccount.id}/disable`,
          {
            method: "PATCH",

            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result =
          (await response.json()) as ApiResponse<unknown>;

        if (!response.ok || !result.success) {
          throw new Error(
            getApiMessage(
              result,
              "Không khóa được tài khoản.",
            ),
          );
        }

        await loadAccounts();

        closeAccountAction();
      } catch (error) {
        setLockError(
          error instanceof Error
            ? error.message
            : "Không khóa được tài khoản.",
        );
      }
    };

  /* =====================================================
     UNLOCK
  ===================================================== */

  const confirmUnlockAccount =
    async () => {
      if (!selectedAccount) {
        return;
      }

      const token = getAccessToken();

      if (!token) {
        setLockError(
          "Phiên đăng nhập không tồn tại.",
        );

        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/users/${selectedAccount.id}/enable`,
          {
            method: "PATCH",

            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result =
          (await response.json()) as ApiResponse<unknown>;

        if (!response.ok || !result.success) {
          throw new Error(
            getApiMessage(
              result,
              "Không mở khóa được tài khoản.",
            ),
          );
        }

        await loadAccounts();

        closeAccountAction();
      } catch (error) {
        setLockError(
          error instanceof Error
            ? error.message
            : "Không mở khóa được tài khoản.",
        );
      }
    };

  /* =====================================================
     UI
  ===================================================== */

  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          gap: "16px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: "#172B4D",
            }}
          >
            Quản lý tài khoản nội bộ
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              color: "#5E6C84",
              fontSize: "13px",
            }}
          >
            Quản lý thông tin và trạng thái tài khoản.
            Phân quyền được thực hiện tại mục Vai trò & quyền.
          </p>
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
            onClick={() =>
              setIsImportModalOpen(true)
            }
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              backgroundColor: "#FFFFFF",
              color: "#236C54",
              border: "1px solid #B9CFC5",
              borderRadius: "5px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            <FileSpreadsheet size={16} />

            Nhập từ Excel
          </button>

          <button
            type="button"
            onClick={openCreateForm}
            style={{
              padding: "10px 16px",
              backgroundColor: "#0052CC",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            + Thêm tài khoản
          </button>
        </div>
      </div>

      {isImportModalOpen && (
        <EmployeeImportModal
          onClose={() =>
            setIsImportModalOpen(false)
          }
        />
      )}

      {pageError && (
        <div
          style={{
            padding: "12px 14px",
            marginBottom: "16px",
            background: "#FFEBE6",
            color: "#BF2600",
            borderRadius: "6px",
          }}
        >
          {pageError}
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <input
          type="text"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Tìm theo tên, email hoặc phòng ban..."
          style={{
            width: "320px",
            padding: "9px 12px",
            border: "1px solid #DFE1E6",
            borderRadius: "4px",
          }}
        />

        <select
          value={roleFilter}
          onChange={handleRoleChange}
          style={{
            padding: "9px 12px",
            border: "1px solid #DFE1E6",
            borderRadius: "4px",
          }}
        >
          <option value="">
            Tất cả vai trò
          </option>

          {ROLE_OPTIONS.map((role) => (
            <option
              key={role.value}
              value={role.value}
            >
              {role.label}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={handleStatusChange}
          style={{
            padding: "9px 12px",
            border: "1px solid #DFE1E6",
            borderRadius: "4px",
          }}
        >
          <option value="">
            Tất cả trạng thái
          </option>

          <option value="Hoạt động">
            Hoạt động
          </option>

          <option value="Đã khóa">
            Đã khóa
          </option>
        </select>

        <button
          type="button"
          onClick={() => {
            void loadAccounts().catch(
              (error) =>
                setPageError(
                  error instanceof Error
                    ? error.message
                    : "Không tải được dữ liệu.",
                ),
            );
          }}
        >
          Làm mới
        </button>
      </div>

      {formMode !== null && (
        <div
          style={{
            padding: "18px",
            marginBottom: "18px",
            border: "1px solid #DFE1E6",
            borderRadius: "6px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            {formMode === "create"
              ? "Thêm tài khoản nội bộ"
              : "Sửa tài khoản nội bộ"}
          </h3>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
              }}
            >
              <input
                type="text"
                placeholder="Họ tên"
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
              />

              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
              />

              {formMode === "create" && (
                <>
                  <input
                    type="password"
                    placeholder="Mật khẩu (ít nhất 6 ký tự)"
                    value={form.password}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        password: event.target.value,
                      })
                    }
                  />

                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        role: event.target.value,
                      })
                    }
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option
                        key={role.value}
                        value={role.value}
                      >
                        {role.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {formMode === "create" && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#5E6C84",
                }}
              >
                Vai trò ban đầu được chọn khi tạo tài khoản.
                Muốn thay đổi vai trò sau đó, sử dụng mục Vai trò & quyền.
              </p>
            )}

            {formError && (
              <div
                style={{
                  marginTop: "10px",
                  color: "#BF2600",
                }}
              >
                {formError}
              </div>
            )}

            <div
              style={{
                marginTop: "14px",
                display: "flex",
                gap: "8px",
              }}
            >
              <button
                type="submit"
                disabled={submitting}
              >
                {submitting
                  ? "Đang lưu..."
                  : formMode === "create"
                    ? "Tạo tài khoản"
                    : "Lưu thay đổi"}
              </button>

              <button
                type="button"
                onClick={closeForm}
              >
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {accountAction === "lock" && selectedAccount && (
        <div
          style={{
            padding: "20px",
            marginBottom: "18px",
            border: "1px solid #DFE1E6",
            borderRadius: "8px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            Khóa tài khoản
          </h3>

          <p>
            Bạn có chắc muốn khóa tài khoản{" "}
            <strong>{selectedAccount.name}</strong>?
          </p>

          <p style={{ color: "#5E6C84" }}>
            {selectedAccount.email}
          </p>

          {lockError && (
            <div
              style={{
                color: "#BF2600",
                marginBottom: "10px",
              }}
            >
              {lockError}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              void confirmLockAccount()
            }
            style={{
              backgroundColor: "#DE350B",
              color: "#FFFFFF",
              border: "none",
              padding: "9px 14px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Xác nhận khóa
          </button>

          <button
            type="button"
            onClick={closeAccountAction}
            style={{
              marginLeft: "8px",
            }}
          >
            Hủy
          </button>
        </div>
      )}

      {accountAction === "unlock" && selectedAccount && (
        <div
          style={{
            padding: "20px",
            marginBottom: "18px",
            border: "1px solid #DFE1E6",
            borderRadius: "8px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <h3 style={{ marginTop: 0 }}>
            Mở khóa tài khoản
          </h3>

          <p>
            Bạn có chắc muốn mở khóa tài khoản{" "}
            <strong>{selectedAccount.name}</strong>?
          </p>

          {lockError && (
            <div
              style={{
                color: "#BF2600",
                marginBottom: "10px",
              }}
            >
              {lockError}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              void confirmUnlockAccount()
            }
            style={{
              backgroundColor: "#00875A",
              color: "#FFFFFF",
              border: "none",
              padding: "9px 14px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Xác nhận mở khóa
          </button>

          <button
            type="button"
            onClick={closeAccountAction}
            style={{
              marginLeft: "8px",
            }}
          >
            Hủy
          </button>
        </div>
      )}

      <div
        style={{
          overflowX: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            backgroundColor: "#FFFFFF",
            textAlign: "left",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "#F4F5F7",
              }}
            >
              <th style={{ padding: "12px" }}>
                STT
              </th>

              <th style={{ padding: "12px" }}>
                Họ tên
              </th>

              <th style={{ padding: "12px" }}>
                Email
              </th>

              <th style={{ padding: "12px" }}>
                Phòng ban
              </th>

              <th style={{ padding: "12px" }}>
                Vai trò
              </th>

              <th style={{ padding: "12px" }}>
                Trạng thái
              </th>

              <th style={{ padding: "12px" }}>
                Thao tác
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "24px",
                    textAlign: "center",
                  }}
                >
                  Đang tải dữ liệu...
                </td>
              </tr>
            )}

            {!loading &&
              displayedAccounts.map(
                (account, index) => (
                  <tr
                    key={account.id}
                    style={{
                      borderBottom:
                        "1px solid #DFE1E6",
                    }}
                  >
                    <td style={{ padding: "12px" }}>
                      {startIndex + index + 1}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {account.name}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {account.email}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {account.department}
                    </td>

                    <td style={{ padding: "12px" }}>
                      {account.role}
                    </td>

                    <td style={{ padding: "12px" }}>
                      <span
                        style={{
                          padding: "5px 9px",
                          borderRadius: "12px",

                          backgroundColor:
                            account.status === "Hoạt động"
                              ? "#E3FCEF"
                              : "#FFEBE6",

                          color:
                            account.status === "Hoạt động"
                              ? "#006644"
                              : "#BF2600",
                        }}
                      >
                        {account.status}
                      </span>
                    </td>

                    <td style={{ padding: "12px" }}>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            openEditForm(account)
                          }
                        >
                          Sửa
                        </button>

                        {account.status === "Hoạt động" ? (
                          <button
                            type="button"
                            onClick={() =>
                              openLockDialog(account)
                            }
                            style={{
                              backgroundColor: "#DE350B",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              padding: "7px 10px",
                              cursor: "pointer",
                            }}
                          >
                            Khóa
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              openUnlockDialog(account)
                            }
                            style={{
                              backgroundColor: "#00875A",
                              color: "#FFFFFF",
                              border: "none",
                              borderRadius: "4px",
                              padding: "7px 10px",
                              cursor: "pointer",
                            }}
                          >
                            Mở khóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ),
              )}

            {!loading &&
              displayedAccounts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding: "20px",
                      textAlign: "center",
                    }}
                  >
                    Không tìm thấy tài khoản phù hợp.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: "16px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <span>
          Hiển thị{" "}
          {filteredAccounts.length === 0
            ? 0
            : startIndex + 1}{" "}
          -{" "}
          {Math.min(
            startIndex + PAGE_SIZE,
            filteredAccounts.length,
          )}{" "}
          / {filteredAccounts.length} tài khoản
        </span>

        <div>
          <button
            type="button"
            disabled={page === 1}
            onClick={() =>
              setCurrentPage((current) =>
                Math.max(1, current - 1),
              )
            }
          >
            Trước
          </button>

          <span
            style={{
              margin: "0 8px",
            }}
          >
            Trang {page} / {totalPages}
          </span>

          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() =>
              setCurrentPage((current) =>
                Math.min(
                  totalPages,
                  current + 1,
                ),
              )
            }
          >
            Sau
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccountManagement;