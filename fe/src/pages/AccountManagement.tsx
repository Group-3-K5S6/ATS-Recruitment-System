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
};

type AccountForm = {
  name: string;
  email: string;
  department: string;
};

const PAGE_SIZE = 20;

const AccountManagement = () => {
  const [accounts, setAccounts] = useState<Account[]>([
    {
      id: 1,
      name: "Nguyễn Văn An",
      email: "an.nguyen@example.com",
      department: "Công nghệ",
      role: "Quản trị hệ thống",
      status: "Hoạt động",
    },
    {
      id: 2,
      name: "Trần Thị Mai",
      email: "mai.tran@example.com",
      department: "Nhân sự",
      role: "Nhân viên tuyển dụng",
      status: "Hoạt động",
    },
    {
      id: 3,
      name: "Lê Minh Đức",
      email: "duc.le@example.com",
      department: "Công nghệ",
      role: "Người phỏng vấn",
      status: "Đã khóa",
    },
  ]);

  const [searchText, setSearchText] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>({
    name: "",
    email: "",
    department: "",
  });
  const [formError, setFormError] = useState("");

  const roles = Array.from(new Set(accounts.map((account) => account.role)));
  const keyword = searchText.trim().toLowerCase();

  const filteredAccounts = accounts.filter((account) => {
    const matchesKeyword =
      keyword === "" ||
      account.name.toLowerCase().includes(keyword) ||
      account.email.toLowerCase().includes(keyword) ||
      account.department.toLowerCase().includes(keyword);

    const matchesRole = roleFilter === "" || account.role === roleFilter;
    const matchesStatus = statusFilter === "" || account.status === statusFilter;

    return matchesKeyword && matchesRole && matchesStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const startIndex = (page - 1) * PAGE_SIZE;
  const displayedAccounts = filteredAccounts.slice(startIndex, startIndex + PAGE_SIZE);

  const closeForm = () => {
    setFormMode(null);
    setEditingId(null);
    setForm({ name: "", email: "", department: "" });
    setFormError("");
  };

  const openCreateForm = () => {
    setFormMode("create");
    setEditingId(null);
    setForm({ name: "", email: "", department: "" });
    setFormError("");
  };

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
        },
      ]);

      closeForm();
      return;
    }

    if (formMode === "edit" && editingId !== null) {
      setAccounts((currentAccounts) =>
        currentAccounts.map((account) =>
          account.id === editingId
            ? { ...account, name, email, department }
            : account,
        ),
      );
      closeForm();
    }
  };

  return (
    <div style={{ padding: "24px", fontFamily: "Arial, sans-serif" }}>
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
          <h2 style={{ margin: 0, color: "#172B4D" }}>
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
                  setForm({ ...form, name: event.target.value })
                }
              />

              <input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, email: event.target.value })
                }
              />

              <input
                type="text"
                placeholder="Phòng ban"
                value={form.department}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setForm({ ...form, department: event.target.value })
                }
              />
            </div>

            {formError && (
              <div style={{ marginTop: "10px", color: "#BF2600" }}>
                {formError}
              </div>
            )}

            <div style={{ marginTop: "14px", display: "flex", gap: "8px" }}>
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

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            backgroundColor: "#FFFFFF",
            textAlign: "left",
          }}
        >
          <thead>
            <tr style={{ backgroundColor: "#F4F5F7" }}>
              <th style={{ padding: "12px" }}>STT</th>
              <th style={{ padding: "12px" }}>Họ tên</th>
              <th style={{ padding: "12px" }}>Email</th>
              <th style={{ padding: "12px" }}>Phòng ban</th>
              <th style={{ padding: "12px" }}>Vai trò</th>
              <th style={{ padding: "12px" }}>Trạng thái</th>
              <th style={{ padding: "12px" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {displayedAccounts.map((account, index) => (
              <tr key={account.id} style={{ borderBottom: "1px solid #DFE1E6" }}>
                <td style={{ padding: "12px" }}>{startIndex + index + 1}</td>
                <td style={{ padding: "12px" }}>{account.name}</td>
                <td style={{ padding: "12px" }}>{account.email}</td>
                <td style={{ padding: "12px" }}>{account.department}</td>
                <td style={{ padding: "12px" }}>{account.role}</td>
                <td style={{ padding: "12px" }}>{account.status}</td>
                <td style={{ padding: "12px" }}>
                  <button type="button" onClick={() => openEditForm(account)}>
                    Sửa
                  </button>
                </td>
              </tr>
            ))}

            {displayedAccounts.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: "20px", textAlign: "center" }}>
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
          Hiển thị {filteredAccounts.length === 0 ? 0 : startIndex + 1} -{" "}
          {Math.min(startIndex + PAGE_SIZE, filteredAccounts.length)} /{" "}
          {filteredAccounts.length} tài khoản
        </span>

        <div>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setCurrentPage((current) => Math.max(1, current - 1))}
          >
            Trước
          </button>

          <span style={{ margin: "0 8px" }}>
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
