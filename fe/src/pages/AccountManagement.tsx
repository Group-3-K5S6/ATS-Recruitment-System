import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";

type AccountStatus = "Hoạt động" | "Đã khóa";

type Account = {
  id: number;
  name: string;
  email: string;
  department: string;
  role: string;
  status: AccountStatus;

  // S1-10
  lockReason?: string;
  assignedPositions?: number;
};

type AccountForm = {
  name: string;
  email: string;
  department: string;
};

const PAGE_SIZE = 20;

const AccountManagement = () => {
  /* =========================
     DỮ LIỆU TÀI KHOẢN
  ========================= */
  const [accounts, setAccounts] = useState<Account[]>([
    {
      id: 1,
      name: "Nguyễn Văn An",
      email: "an.nguyen@example.com",
      department: "Công nghệ",
      role: "Quản trị hệ thống",
      status: "Hoạt động",
      assignedPositions: 0,
    },
    {
      id: 2,
      name: "Trần Thị Mai",
      email: "mai.tran@example.com",
      department: "Nhân sự",
      role: "Nhân viên tuyển dụng",
      status: "Hoạt động",
      assignedPositions: 3,
    },
    {
      id: 3,
      name: "Lê Minh Đức",
      email: "duc.le@example.com",
      department: "Công nghệ",
      role: "Người phỏng vấn",
      status: "Đã khóa",
      lockReason: "Nhân sự đã nghỉ việc",
      assignedPositions: 0,
    },
  ]);

  /* =========================
     TÌM KIẾM + LỌC
  ========================= */
  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  /* =========================
     FORM TẠO / SỬA
  ========================= */
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState<AccountForm>({
    name: "",
    email: "",
    department: "",
  });

  const [formError, setFormError] = useState("");

  /* =========================
     S1-10 - KHÓA / MỞ KHÓA
  ========================= */
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const [accountAction, setAccountAction] = useState<"lock" | "unlock" | null>(
    null,
  );

  const [lockReason, setLockReason] = useState("");

  const [lockError, setLockError] = useState("");

  /* =========================
     DANH SÁCH ROLE
  ========================= */
  const roles = Array.from(new Set(accounts.map((account) => account.role)));

  /* =========================
     LỌC DANH SÁCH
  ========================= */
  const keyword = searchText.trim().toLowerCase();

  const filteredAccounts = accounts.filter((account) => {
    const matchesKeyword =
      keyword === "" ||
      account.name.toLowerCase().includes(keyword) ||
      account.email.toLowerCase().includes(keyword) ||
      account.department.toLowerCase().includes(keyword);

    const matchesRole = roleFilter === "" || account.role === roleFilter;

    const matchesStatus =
      statusFilter === "" || account.status === statusFilter;

    return matchesKeyword && matchesRole && matchesStatus;
  });

  /* =========================
     PHÂN TRANG
  ========================= */
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

  /* =========================
     ĐÓNG FORM
  ========================= */
  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);

    setForm({
      name: "",
      email: "",
      department: "",
    });

    setFormError("");
  };

  /* =========================
     MỞ FORM TẠO
  ========================= */
  const openCreateForm = () => {
    setFormMode("create");
    setEditingId(null);

    setForm({
      name: "",
      email: "",
      department: "",
    });

    setFormError("");
  };

  /* =========================
     MỞ FORM SỬA
  ========================= */
  const openEditForm = (account: Account) => {
    setFormMode("edit");
    setEditingId(account.id);

    setForm({
      name: account.name,
      email: account.email,
      department: account.department,
    });

    setFormError("");
  };

  /* =========================
     SEARCH
  ========================= */
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchText(event.target.value);
    setCurrentPage(1);
  };

  /* =========================
     FILTER ROLE
  ========================= */
  const handleRoleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setRoleFilter(event.target.value);
    setCurrentPage(1);
  };

  /* =========================
     FILTER STATUS
  ========================= */
  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value);
    setCurrentPage(1);
  };

  /* =========================
     SUBMIT FORM TẠO / SỬA
  ========================= */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setFormError("");

    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    const department = form.department.trim();

    if (!name || !email || !department) {
      setFormError("Vui lòng nhập đầy đủ họ tên, email và phòng ban.");
      return;
    }

    const duplicateEmail = accounts.some(
      (account) =>
        account.email.toLowerCase() === email && account.id !== editingId,
    );

    if (duplicateEmail) {
      setFormError(`Email "${form.email.trim()}" đã tồn tại trong hệ thống.`);
      return;
    }

    /* TẠO */
    if (formMode === "create") {
      const nextId =
        accounts.length === 0
          ? 1
          : Math.max(...accounts.map((account) => account.id)) + 1;

      setAccounts((currentAccounts) => [
        ...currentAccounts,
        {
          id: nextId,
          name,
          email,
          department,
          role: "Người phỏng vấn",
          status: "Hoạt động",
          assignedPositions: 0,
        },
      ]);

      closeForm();
      return;
    }

    /* SỬA */
    if (formMode === "edit" && editingId !== null) {
      setAccounts((currentAccounts) =>
        currentAccounts.map((account) =>
          account.id === editingId
            ? {
                ...account,
                name,
                email,
                department,
              }
            : account,
        ),
      );

      closeForm();
    }
  };

  /* =========================
     S1-10 - MỞ HỘP KHÓA
  ========================= */
  const openLockDialog = (account: Account) => {
    setSelectedAccount(account);
    setAccountAction("lock");
    setLockReason("");
    setLockError("");
  };

  /* =========================
     S1-10 - MỞ HỘP MỞ KHÓA
  ========================= */
  const openUnlockDialog = (account: Account) => {
    setSelectedAccount(account);
    setAccountAction("unlock");
    setLockReason("");
    setLockError("");
  };

  /* =========================
     S1-10 - ĐÓNG HỘP
  ========================= */
  const closeAccountAction = () => {
    setSelectedAccount(null);
    setAccountAction(null);
    setLockReason("");
    setLockError("");
  };

  /* =========================
     S1-10 - XÁC NHẬN KHÓA
  ========================= */
  const confirmLockAccount = () => {
    if (!selectedAccount) {
      return;
    }

    if (!lockReason.trim()) {
      setLockError("Vui lòng nhập lý do khóa tài khoản.");
      return;
    }

    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.id === selectedAccount.id
          ? {
              ...account,
              status: "Đã khóa",
              lockReason: lockReason.trim(),
            }
          : account,
      ),
    );

    closeAccountAction();
  };

  /* =========================
     S1-10 - XÁC NHẬN MỞ KHÓA
  ========================= */
  const confirmUnlockAccount = () => {
    if (!selectedAccount) {
      return;
    }

    setAccounts((currentAccounts) =>
      currentAccounts.map((account) =>
        account.id === selectedAccount.id
          ? {
              ...account,
              status: "Hoạt động",
              lockReason: undefined,
            }
          : account,
      ),
    );

    closeAccountAction();
  };

  /* =========================
     GIAO DIỆN
  ========================= */
  return (
    <div
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* HEADER */}
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
        </div>

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

      {/* SEARCH + FILTER */}
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
          <option value="">Tất cả vai trò</option>

          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
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
          <option value="">Tất cả trạng thái</option>

          <option value="Hoạt động">Hoạt động</option>

          <option value="Đã khóa">Đã khóa</option>
        </select>
      </div>

      {/* FORM TẠO / SỬA */}
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
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
              }}
            >
              <input
                type="text"
                placeholder="Họ tên"
                value={form.name}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
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
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
              />

              <input
                type="text"
                placeholder="Phòng ban"
                value={form.department}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setForm({
                    ...form,
                    department: event.target.value,
                  })
                }
              />
            </div>

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
              <button type="submit">
                {formMode === "create" ? "Tạo tài khoản" : "Lưu thay đổi"}
              </button>

              <button type="button" onClick={closeForm}>
                Hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =========================
          S1-10 - HỘP KHÓA
      ========================== */}
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
          <h3 style={{ marginTop: 0 }}>Khóa tài khoản</h3>

          <p>
            Bạn đang khóa tài khoản:
            <strong> {selectedAccount.name}</strong>
          </p>

          <p
            style={{
              color: "#5E6C84",
            }}
          >
            {selectedAccount.email}
          </p>

          {(selectedAccount.assignedPositions ?? 0) > 0 && (
            <div
              style={{
                padding: "12px",
                marginBottom: "14px",
                backgroundColor: "#FFF7D6",
                color: "#974F0C",
                borderRadius: "6px",
              }}
            >
              ⚠ Người dùng đang phụ trách{" "}
              <strong>{selectedAccount.assignedPositions}</strong> vị trí tuyển
              dụng. Cần thực hiện bàn giao.
            </div>
          )}

          <label>
            <strong>Lý do khóa *</strong>
          </label>

          <textarea
            value={lockReason}
            onChange={(event) => setLockReason(event.target.value)}
            placeholder="Nhập lý do khóa tài khoản..."
            rows={4}
            style={{
              width: "100%",
              marginTop: "8px",
              padding: "10px",
              border: "1px solid #DFE1E6",
              borderRadius: "4px",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />

          {lockError && (
            <div
              style={{
                color: "#BF2600",
                marginTop: "8px",
              }}
            >
              {lockError}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "14px",
            }}
          >
            <button
              type="button"
              onClick={confirmLockAccount}
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

            <button type="button" onClick={closeAccountAction}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* =========================
          S1-10 - HỘP MỞ KHÓA
      ========================== */}
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
          <h3 style={{ marginTop: 0 }}>Mở khóa tài khoản</h3>

          <p>
            Bạn có chắc muốn mở khóa tài khoản:
            <strong> {selectedAccount.name}</strong>?
          </p>

          {selectedAccount.lockReason && (
            <p
              style={{
                padding: "10px",
                backgroundColor: "#F4F5F7",
                borderRadius: "4px",
              }}
            >
              <strong>Lý do khóa trước đó:</strong> {selectedAccount.lockReason}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "14px",
            }}
          >
            <button
              type="button"
              onClick={confirmUnlockAccount}
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

            <button type="button" onClick={closeAccountAction}>
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* =========================
          BẢNG TÀI KHOẢN
      ========================== */}
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
              <th
                style={{
                  padding: "12px",
                }}
              >
                STT
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Họ tên
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Email
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Phòng ban
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Vai trò
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Trạng thái
              </th>

              <th
                style={{
                  padding: "12px",
                }}
              >
                Thao tác
              </th>
            </tr>
          </thead>

          <tbody>
            {displayedAccounts.map((account, index) => (
              <tr
                key={account.id}
                style={{
                  borderBottom: "1px solid #DFE1E6",
                }}
              >
                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  {startIndex + index + 1}
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  {account.name}
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  {account.email}
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  {account.department}
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  {account.role}
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  <span
                    style={{
                      padding: "5px 9px",
                      borderRadius: "12px",

                      backgroundColor:
                        account.status === "Hoạt động" ? "#E3FCEF" : "#FFEBE6",

                      color:
                        account.status === "Hoạt động" ? "#006644" : "#BF2600",
                    }}
                  >
                    {account.status}
                  </span>
                </td>

                <td
                  style={{
                    padding: "12px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button type="button" onClick={() => openEditForm(account)}>
                      Sửa
                    </button>

                    {account.status === "Hoạt động" ? (
                      <button
                        type="button"
                        onClick={() => openLockDialog(account)}
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
                        onClick={() => openUnlockDialog(account)}
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
            ))}

            {displayedAccounts.length === 0 && (
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

      {/* =========================
          PHÂN TRANG
      ========================== */}
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
          Hiển thị {filteredAccounts.length === 0 ? 0 : startIndex + 1} -{" "}
          {Math.min(startIndex + PAGE_SIZE, filteredAccounts.length)} /{" "}
          {filteredAccounts.length} tài khoản
        </span>

        <div>
          <button
            type="button"
            disabled={page === 1}
            onClick={() =>
              setCurrentPage((current) => Math.max(1, current - 1))
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
              setCurrentPage((current) => Math.min(totalPages, current + 1))
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
