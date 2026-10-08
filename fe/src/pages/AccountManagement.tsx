import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { FileSpreadsheet } from "lucide-react";
import "./AccountManagement.css";

import EmployeeImportModal from "../components/EmployeeImportModal";

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

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

function getApiMessage(result: ApiResponse<unknown>, fallback: string) {
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

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<AccountForm>({
    name: "",
    email: "",
    password: "",
    role: "INTERVIEWER",
  });

  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const [accountAction, setAccountAction] = useState<"lock" | "unlock" | null>(
    null,
  );

  const [lockError, setLockError] = useState("");
  const [lockReason, setLockReason] = useState("");
const [handoverWarning, setHandoverWarning] = useState(""); 

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

    const result = (await response.json()) as ApiResponse<BackendUser[]>;

    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error(
        getApiMessage(result, "Không tải được danh sách tài khoản."),
      );
    }

    const mapped: Account[] = result.data.map((user) => {
      const roles = Array.isArray(user.roles) ? user.roles : [];

      return {
        id: user.id,
        name: user.fullName,
        email: user.email,

        department: user.department?.name || "Chưa gán phòng ban",

        roles,

        role:
          roles.length > 0
            ? roles.map(roleLabel).join(", ")
            : "Chưa có vai trò",

        status: user.isActive ? "Hoạt động" : "Đã khóa",
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
          error instanceof Error ? error.message : "Không tải được dữ liệu.",
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

    const matchesRole = roleFilter === "" || account.roles.includes(roleFilter);

    const matchesStatus =
      statusFilter === "" || account.status === statusFilter;

    return matchesKeyword && matchesRole && matchesStatus;
  });

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAccounts.length / PAGE_SIZE),
  );

  const page = Math.min(currentPage, totalPages);

  const startIndex = (page - 1) * PAGE_SIZE;

  const displayedAccounts = filteredAccounts.slice(
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

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    setCurrentPage(1);
  };

  const handleRoleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(event.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
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

        roles: [form.role],
      }),
    });

    const result = (await response.json()) as ApiResponse<BackendUser>;

    if (!response.ok || !result.success) {
      throw new Error(getApiMessage(result, "Không tạo được tài khoản."));
    }
  };

  /* =====================================================
     UPDATE ACCOUNT
  ===================================================== */

  const updateAccount = async (id: string) => {
    const token = getAccessToken();

    if (!token) {
      throw new Error("Phiên đăng nhập không tồn tại.");
    }

    const response = await fetch(`${API_URL}/api/users/${id}`, {
      method: "PUT",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },

      body: JSON.stringify({
        email: form.email.trim().toLowerCase(),
        fullName: form.name.trim(),
      }),
    });

    const result = (await response.json()) as ApiResponse<BackendUser>;

    if (!response.ok || !result.success) {
      throw new Error(getApiMessage(result, "Không cập nhật được tài khoản."));
    }
  };

  /* =====================================================
     SUBMIT
  ===================================================== */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setFormError("");

    const name = form.name.trim();

    const email = form.email.trim().toLowerCase();

    if (!name || !email) {
      setFormError("Vui lòng nhập đầy đủ họ tên và email.");

      return;
    }

    const duplicateEmail = accounts.some(
      (account) =>
        account.email.toLowerCase() === email && account.id !== editingId,
    );

    if (duplicateEmail) {
      setFormError(`Email "${email}" đã tồn tại trong hệ thống.`);

      return;
    }

    if (formMode === "create") {
      if (!form.password || !form.role) {
        setFormError("Vui lòng nhập mật khẩu và chọn vai trò.");

        return;
      }

      if (form.password.length < 6) {
        setFormError("Mật khẩu phải có ít nhất 6 ký tự.");

        return;
      }
    }

    try {
      setSubmitting(true);

      if (formMode === "create") {
        await createAccount();
      }

      if (formMode === "edit" && editingId) {
        await updateAccount(editingId);
      }

      await loadAccounts();

      closeForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Có lỗi xảy ra.");
    } finally {
      setSubmitting(false);
    }
  };

  /* =====================================================
     LOCK
  ===================================================== */

  const openLockDialog = (account: Account) => {
  setSelectedAccount(account);
  setAccountAction("lock");
  setLockError("");
  setLockReason("");
  setHandoverWarning("");
};

  const openUnlockDialog = (account: Account) => {
    setSelectedAccount(account);

    setAccountAction("unlock");

    setLockError("");
  };

 const closeAccountAction = () => {
  setSelectedAccount(null);
  setAccountAction(null);
  setLockError("");
  setLockReason("");
  setHandoverWarning("");
};

  const confirmLockAccount = async (
  confirmHandover = false,
) => {
  if (!selectedAccount) {
    return;
  }

  const reason = lockReason.trim();

  if (reason.length < 3) {
    setLockError(
      "Vui lòng nhập lý do khóa tài khoản, ít nhất 3 ký tự.",
    );
    return;
  }

  const token = getAccessToken();

  if (!token) {
    setLockError("Phiên đăng nhập không tồn tại.");
    return;
  }

  setLockError("");

  try {
    const response = await fetch(
      `${API_URL}/api/users/${selectedAccount.id}/disable`,
      {
        method: "PATCH",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },

        body: JSON.stringify({
          reason,
          confirmHandover,
        }),
      },
    );

    const result =
      (await response.json()) as ApiResponse<unknown>;

    if (
      response.status === 409 &&
      !confirmHandover
    ) {
      setHandoverWarning(
        getApiMessage(
          result,
          "Người dùng đang phụ trách công việc. Cần xác nhận bàn giao trước khi khóa.",
        ),
      );
      return;
    }

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

const confirmUnlockAccount = async () => {
  if (!selectedAccount) {
    return;
  }

  const token = getAccessToken();

  if (!token) {
    setLockError("Phiên đăng nhập không tồn tại.");
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
    <div className="account-page">
      {/* HEADER */}
      <div className="account-header">
        <div>
          <h1>Quản lý tài khoản nội bộ</h1>
          <p>
            Quản lý thông tin và trạng thái tài khoản. Phân quyền được thực hiện
            tại mục Vai trò & quyền.
          </p>
        </div>

        <div className="account-header-actions">
          <button
            type="button"
            className="account-btn account-btn-outline"
            onClick={() => setIsImportModalOpen(true)}
          >
            <FileSpreadsheet size={17} />
            Nhập từ Excel
          </button>

          <button
            type="button"
            className="account-btn account-btn-primary"
            onClick={openCreateForm}
          >
            + Thêm tài khoản
          </button>
        </div>
      </div>

      {isImportModalOpen && (
        <EmployeeImportModal onClose={() => setIsImportModalOpen(false)} />
      )}

      {pageError && (
        <div className="account-alert account-alert-error">{pageError}</div>
      )}

      {/* FILTER */}
      <div className="account-toolbar">
        <input
          className="account-control"
          type="text"
          value={searchText}
          onChange={handleSearchChange}
          placeholder="Tìm theo tên, email hoặc phòng ban..."
        />

        <select
          className="account-control"
          value={roleFilter}
          onChange={handleRoleChange}
        >
          <option value="">Tất cả vai trò</option>

          {ROLE_OPTIONS.map((role) => (
            <option key={role.value} value={role.value}>
              {role.label}
            </option>
          ))}
        </select>

        <select
          className="account-control"
          value={statusFilter}
          onChange={handleStatusChange}
        >
          <option value="">Tất cả trạng thái</option>
          <option value="Hoạt động">Hoạt động</option>
          <option value="Đã khóa">Đã khóa</option>
        </select>

        <button
          type="button"
          className="account-btn account-btn-secondary"
          onClick={() => {
            void loadAccounts().catch((error) =>
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

      {/* FORM THÊM / SỬA */}
      {formMode !== null && (
        <div className="account-modal-overlay">
          <div className="account-modal">
            <div className="account-modal-header">
              <div>
                <h2>
                  {formMode === "create"
                    ? "Thêm tài khoản mới"
                    : "Sửa tài khoản"}
                </h2>
                <p>
                  {formMode === "create"
                    ? "Tạo tài khoản nội bộ và gán vai trò ban đầu."
                    : "Cập nhật thông tin tài khoản."}
                </p>
              </div>

              <button
                type="button"
                className="account-modal-close"
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="account-modal-body">
                <div className="account-field">
                  <label>
                    Họ và tên <span>*</span>
                  </label>

                  <input
                    className="account-control"
                    type="text"
                    placeholder="Nguyễn Văn A"
                    value={form.name}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        name: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="account-field">
                  <label>
                    Email công ty <span>*</span>
                  </label>

                  <input
                    className="account-control"
                    type="email"
                    placeholder="user@company.local"
                    value={form.email}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        email: event.target.value,
                      })
                    }
                  />
                </div>

                {formMode === "create" && (
                  <>
                    <div className="account-field">
                      <label>
                        Mật khẩu <span>*</span>
                      </label>

                      <input
                        className="account-control"
                        type="password"
                        placeholder="Ít nhất 6 ký tự"
                        value={form.password}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            password: event.target.value,
                          })
                        }
                      />
                    </div>

                    <div className="account-field">
                      <label>
                        Vai trò phân quyền <span>*</span>
                      </label>

                      <select
                        className="account-control"
                        value={form.role}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            role: event.target.value,
                          })
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {formError && (
                  <div className="account-alert account-alert-error">
                    {formError}
                  </div>
                )}
              </div>

              <div className="account-modal-footer">
                <button
                  type="button"
                  className="account-btn account-btn-secondary"
                  onClick={closeForm}
                >
                  Hủy
                </button>

                <button
                  type="submit"
                  className="account-btn account-btn-primary"
                  disabled={submitting}
                >
                  {submitting
                    ? "Đang lưu..."
                    : formMode === "create"
                      ? "✓ Tạo tài khoản"
                      : "Lưu thay đổi"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL KHÓA */}
{accountAction === "lock" && selectedAccount && (
  <div className="account-confirm-overlay">
    <div className="account-confirm">
      <h3>Khóa tài khoản</h3>

      <p>
        Bạn có chắc muốn khóa tài khoản{" "}
        <strong>{selectedAccount.name}</strong>?
      </p>

      <p className="account-confirm-email">
        {selectedAccount.email}
      </p>

      <div style={{ marginTop: 16 }}>
        <label
          htmlFor="lockReason"
          style={{
            display: "block",
            marginBottom: 6,
            fontWeight: 600,
          }}
        >
          Lý do khóa <span style={{ color: "#B42318" }}>*</span>
        </label>

        <textarea
          id="lockReason"
          value={lockReason}
          onChange={(event) => {
            setLockReason(event.target.value);
            setLockError("");
            setHandoverWarning("");
          }}
          placeholder="Ví dụ: Nhân viên đã nghỉ việc..."
          rows={3}
          maxLength={500}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: 10,
            resize: "vertical",
          }}
        />
      </div>

      {handoverWarning && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#FFF7E6",
            border: "1px solid #F5B942",
            borderRadius: 6,
          }}
        >
          <strong>Cảnh báo bàn giao công việc</strong>

          <p style={{ marginBottom: 0 }}>
            {handoverWarning}
          </p>
        </div>
      )}

      {lockError && (
        <div className="account-alert account-alert-error">
          {lockError}
        </div>
      )}

      <div className="account-confirm-actions">
        <button
          type="button"
          className="account-btn account-btn-secondary"
          onClick={closeAccountAction}
        >
          Hủy
        </button>

        {handoverWarning ? (
          <button
            type="button"
            className="account-btn account-btn-danger"
            onClick={() =>
              void confirmLockAccount(true)
            }
          >
            Đã bàn giao và xác nhận khóa
          </button>
        ) : (
          <button
            type="button"
            className="account-btn account-btn-danger"
            onClick={() =>
              void confirmLockAccount(false)
            }
          >
            Xác nhận khóa
          </button>
        )}
      </div>
    </div>
  </div>
)}

      {/* MODAL MỞ KHÓA */}
      {accountAction === "unlock" && selectedAccount && (
        <div className="account-confirm-overlay">
          <div className="account-confirm">
            <h3>Mở khóa tài khoản</h3>

            <p>
              Bạn có chắc muốn mở khóa tài khoản{" "}
              <strong>{selectedAccount.name}</strong>?
            </p>

            <p className="account-confirm-email">{selectedAccount.email}</p>

            {lockError && (
              <div className="account-alert account-alert-error">
                {lockError}
              </div>
            )}

            <div className="account-confirm-actions">
              <button
                type="button"
                className="account-btn account-btn-secondary"
                onClick={closeAccountAction}
              >
                Hủy
              </button>

              <button
                type="button"
                className="account-btn account-btn-success"
                onClick={() => void confirmUnlockAccount()}
              >
                Xác nhận mở khóa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div className="account-card account-table-card">
        <div className="account-table-scroll">
          <table className="account-table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Phòng ban</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="account-empty">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {!loading &&
                displayedAccounts.map((account, index) => (
                  <tr key={account.id}>
                    <td>{startIndex + index + 1}</td>

                    <td className="account-name">{account.name}</td>

                    <td className="account-email">{account.email}</td>

                    <td>{account.department}</td>

                    <td>{account.role}</td>

                    <td>
                      <span
                        className={`account-status ${
                          account.status === "Hoạt động"
                            ? "account-status-active"
                            : "account-status-locked"
                        }`}
                      >
                        {account.status}
                      </span>
                    </td>

                    <td>
                      <div className="account-actions">
                        <button
                          type="button"
                          className="account-btn account-btn-secondary account-action-btn"
                          onClick={() => openEditForm(account)}
                        >
                          Sửa
                        </button>

                        {account.status === "Hoạt động" ? (
                          <button
                            type="button"
                            className="account-btn account-btn-danger account-action-btn"
                            onClick={() => openLockDialog(account)}
                          >
                            Khóa
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="account-btn account-btn-success account-action-btn"
                            onClick={() => openUnlockDialog(account)}
                          >
                            Mở khóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && displayedAccounts.length === 0 && (
                <tr>
                  <td colSpan={7} className="account-empty">
                    Không tìm thấy tài khoản phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="account-pagination">
          <span>
            Hiển thị {filteredAccounts.length === 0 ? 0 : startIndex + 1} -{" "}
            {Math.min(startIndex + PAGE_SIZE, filteredAccounts.length)} /{" "}
            {filteredAccounts.length} tài khoản
          </span>

          <div className="account-pagination-controls">
            <button
              type="button"
              className="account-btn account-btn-secondary account-action-btn"
              disabled={page === 1}
              onClick={() =>
                setCurrentPage((current) => Math.max(1, current - 1))
              }
            >
              Trước
            </button>

            <span className="account-page-number">
              Trang {page} / {totalPages}
            </span>

            <button
              type="button"
              className="account-btn account-btn-secondary account-action-btn"
              disabled={page >= totalPages}
              onClick={() =>
                setCurrentPage((current) => Math.min(totalPages, current + 1))
              }
            >
              Sau
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountManagement;
