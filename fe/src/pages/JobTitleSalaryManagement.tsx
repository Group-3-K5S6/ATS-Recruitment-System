import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import { clearLocalSession } from "../services/session";

import {
  createJobTitle,
  deleteJobTitle,
  getJobTitles,
  updateJobTitle,
} from "../services/jobTitleApi";

import type {
  JobTitle,
  JobTitlePayload,
} from "../services/jobTitleApi";

/* =========================================================
   TYPE
========================================================= */

type JobTitleSalaryManagementProps = {
  role: Role;
  userName: string;
};

/* =========================================================
   DỮ LIỆU MẪU
========================================================= */


/* =========================================================
   FORMAT TIỀN
========================================================= */

function formatSalary(value: number) {
  return `${new Intl.NumberFormat("vi-VN").format(value)} đ`;
}

/* =========================================================
   COMPONENT
========================================================= */

function JobTitleSalaryManagement({
  role,
  userName,
}: JobTitleSalaryManagementProps) {
  const navigate = useNavigate();

 const [jobTitles, setJobTitles] =
  useState<JobTitle[]>([]);



  const [showModal, setShowModal] = useState(false);

  const [editingJob, setEditingJob] =
    useState<JobTitle | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [minSalary, setMinSalary] = useState("");
  const [maxSalary, setMaxSalary] = useState("");

  const [error, setError] = useState("");
useEffect(() => {
  let active = true;

  const loadJobTitles = async () => {
    try {

      setError("");

      const data = await getJobTitles();

      if (active) {
        setJobTitles(data);
      }
    } catch (err) {
      if (active) {
        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải danh sách chức danh.",
        );
      }
    }
  };

  void loadJobTitles();

  return () => {
    active = false;
  };
}, []);
  /* =======================================================
     ĐĂNG XUẤT
  ======================================================= */

  const handleLogout = async () => {
    clearLocalSession();

    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("atsUser");

    navigate("/login", {
      replace: true,
    });
  };

  /* =======================================================
     ĐIỀU HƯỚNG MENU
  ======================================================= */

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

  /* =======================================================
     THÊM CHỨC DANH
  ======================================================= */

  const openAddModal = () => {
    setEditingJob(null);

    setCode("");
    setName("");
    setLevel("");
    setMinSalary("");
    setMaxSalary("");

    setError("");
    setShowModal(true);
  };

  /* =======================================================
     SỬA CHỨC DANH
  ======================================================= */

  const openEditModal = (job: JobTitle) => {
    setEditingJob(job);

    setCode(job.code);
    setName(job.name);
    setLevel(job.level);
    setMinSalary(String(job.minSalary));
    setMaxSalary(String(job.maxSalary));

    setError("");
    setShowModal(true);
  };

  /* =======================================================
     ĐÓNG MODAL
  ======================================================= */

  const closeModal = () => {
    setShowModal(false);
    setEditingJob(null);
    setError("");
  };

  /* =======================================================
     LƯU CHỨC DANH
  ======================================================= */

  const handleSaveJob = async () => {
    const min = Number(minSalary);
    const max = Number(maxSalary);

    if (
      !code.trim() ||
      !name.trim() ||
      !level.trim() ||
      !minSalary ||
      !maxSalary
    ) {
      setError(
        "Vui lòng nhập đầy đủ thông tin chức danh và dải lương.",
      );
      return;
    }

    if (
      Number.isNaN(min) ||
      Number.isNaN(max) ||
      min <= 0 ||
      max <= 0
    ) {
      setError("Mức lương phải là số lớn hơn 0.");
      return;
    }

    if (min > max) {
      setError(
        "Mức lương tối thiểu không được lớn hơn mức lương tối đa.",
      );
      return;
    }

    const duplicatedCode = jobTitles.some(
      (job) =>
        job.code.toLowerCase() === code.trim().toLowerCase() &&
        job.id !== editingJob?.id,
    );

    if (duplicatedCode) {
      setError("Mã chức danh đã tồn tại.");
      return;
    }
  const payload: JobTitlePayload = {
  code: code.trim(),
  name: name.trim(),
  level: level.trim(),
  minSalary: min,
  maxSalary: max,
};

try {
  setError("");

  if (editingJob) {
    const updated = await updateJobTitle(
      editingJob.id,
      payload,
    );

    setJobTitles((current) =>
      current.map((job) =>
        job.id === updated.id ? updated : job,
      ),
    );
  } else {
    const created = await createJobTitle(payload);

    setJobTitles((current) => [
      ...current,
      created,
    ]);
  }

  closeModal();
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : "Không thể lưu chức danh.",
  );
}
  };

  /* =======================================================
     XÓA CHỨC DANH
  ======================================================= */

  const handleDeleteJob = async (job: JobTitle) => {
    const confirmed = window.confirm(
      `Bạn có chắc muốn xóa chức danh "${job.name}" khỏi danh mục Nhân sự không?`,
    );

    if (!confirmed) {
      return;
    }

   try {
  setError("");

  await deleteJobTitle(job.id);

  setJobTitles((current) =>
    current.filter((item) => item.id !== job.id),
  );
} catch (err) {
  setError(
    err instanceof Error
      ? err.message
      : "Không thể xóa chức danh.",
  );
}
  };

  /* =======================================================
     THỐNG KÊ
  ======================================================= */

  const highestSalary =
    jobTitles.length > 0
      ? Math.max(...jobTitles.map((job) => job.maxSalary))
      : 0;

  const lowestSalary =
    jobTitles.length > 0
      ? Math.min(...jobTitles.map((job) => job.minSalary))
      : 0;

  /* =======================================================
     GIAO DIỆN
  ======================================================= */

  return (
    <div className="dashboard-layout">
      {/* SIDEBAR DÙNG ROLE THẬT */}

      <Sidebar
        role={role}
        userName={userName}
        onLogout={handleLogout}
        selectedMenu="Chức danh & dải lương"
        onMenuSelect={handleMenuSelect}
      />

      <main className="dashboard-content">
        <div
          style={{
            padding: "30px",
            maxWidth: "1180px",
          }}
        >
          {/* TIÊU ĐỀ */}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
              marginBottom: "24px",
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 5px",
                  color: "#267553",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                QUẢN TRỊ NHÂN SỰ
              </p>

              <h1
                style={{
                  margin: 0,
                  color: "#24332d",
                  fontSize: "28px",
                }}
              >
                Chức danh & dải lương
              </h1>

              <p
                style={{
                  margin: "8px 0 0",
                  color: "#718078",
                  fontSize: "14px",
                }}
              >
                Quản lý khung chức danh, cấp bậc và mức lương được
                công ty phê duyệt.
              </p>
            </div>

            <button
              type="button"
              onClick={openAddModal}
              style={primaryButton}
            >
              + Thêm chức danh
            </button>
          </div>

          {/* THỐNG KÊ */}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "14px",
              marginBottom: "22px",
            }}
          >
            <StatCard
              title="Tổng chức danh"
              value={String(jobTitles.length)}
              note="Đang quản lý trong hệ thống"
            />

            <StatCard
              title="Mức lương thấp nhất"
              value={formatSalary(lowestSalary)}
              note="Theo khung lương hiện tại"
            />

            <StatCard
              title="Mức lương cao nhất"
              value={formatSalary(highestSalary)}
              note="Hạn mức tham chiếu cao nhất"
            />
          </div>

          {/* BẢNG */}

          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e1e7e4",
              borderRadius: "10px",
              overflow: "hidden",
              boxShadow:
                "0 4px 16px rgba(34, 63, 49, 0.04)",
            }}
          >
            <div
              style={{
                padding: "20px 22px",
                borderBottom: "1px solid #e8eeeb",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  color: "#2d3d35",
                  fontSize: "18px",
                }}
              >
                Danh mục chức danh Nhân sự
              </h2>

              <p
                style={{
                  margin: "6px 0 0",
                  color: "#7c8983",
                  fontSize: "12px",
                }}
              >
                Dải lương là dữ liệu nội bộ dùng để kiểm soát mức
                đề xuất và duyệt offer.
              </p>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  minWidth: "900px",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "#f6f9f7",
                    }}
                  >
                    <th style={thStyle}>Mã chức danh</th>
                    <th style={thStyle}>Tên chức danh</th>
                    <th style={thStyle}>Cấp bậc</th>
                    <th style={thStyle}>Lương tối thiểu</th>
                    <th style={thStyle}>Lương tối đa</th>
                    <th style={thStyle}>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {jobTitles.map((job) => (
                    <tr key={job.id}>
                      <td style={tdStyle}>
                        <strong
                          style={{
                            color: "#305d49",
                          }}
                        >
                          {job.code}
                        </strong>
                      </td>

                      <td style={tdStyle}>{job.name}</td>

                      <td style={tdStyle}>
                        <span style={levelBadge}>
                          {job.level}
                        </span>
                      </td>

                      <td style={salaryCell}>
                        {formatSalary(job.minSalary)}
                      </td>

                      <td style={salaryCell}>
                        {formatSalary(job.maxSalary)}
                      </td>

                      <td style={tdStyle}>
                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => openEditModal(job)}
                            style={editButton}
                          >
                            Sửa
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteJob(job)}
                            style={deleteButton}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* THÔNG TIN BẢO MẬT */}

          <div
            style={{
              marginTop: "16px",
              padding: "14px 16px",
              border: "1px solid #dbe9e1",
              borderRadius: "8px",
              background: "#f4faf6",
              color: "#527361",
              fontSize: "12px",
              lineHeight: 1.6,
            }}
          >
            <strong>Thông tin bảo mật Nhân sự:</strong> Dải lương
            là dữ liệu nội bộ và chỉ người dùng có quyền phù hợp
            mới được phép truy cập và quản lý.
          </div>
        </div>
      </main>

      {/* ===================================================
          MODAL
      =================================================== */}

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.38)",
          }}
        >
          <div
            style={{
              width: "500px",
              maxWidth: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: "12px",
              padding: "24px",
              boxShadow:
                "0 18px 45px rgba(0,0,0,0.2)",
            }}
          >
            <p
              style={{
                margin: "0 0 5px",
                color: "#267553",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              PHÒNG NHÂN SỰ
            </p>

            <h2
              style={{
                margin: 0,
                color: "#24332d",
              }}
            >
              {editingJob
                ? "Cập nhật chức danh"
                : "Khai báo chức danh mới"}
            </h2>

            <Field label="Mã chức danh">
              <input
                type="text"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value)
                }
                placeholder="Ví dụ: HR-REC-01"
                style={inputStyle}
              />
            </Field>

            <Field label="Tên chức danh">
              <input
                type="text"
                value={name}
                onChange={(event) =>
                  setName(event.target.value)
                }
                placeholder="Nhập tên chức danh"
                style={inputStyle}
              />
            </Field>

            <Field label="Cấp bậc">
              <select
                value={level}
                onChange={(event) =>
                  setLevel(event.target.value)
                }
                style={inputStyle}
              >
                <option value="">
                  -- Chọn cấp bậc --
                </option>

                <option value="Thực tập sinh">
                  Thực tập sinh
                </option>

                <option value="Nhân viên">
                  Nhân viên
                </option>

                <option value="Chuyên viên">
                  Chuyên viên
                </option>

                <option value="Chuyên viên cao cấp">
                  Chuyên viên cao cấp
                </option>

                <option value="Trưởng nhóm">
                  Trưởng nhóm
                </option>

                <option value="Quản lý">
                  Quản lý
                </option>
              </select>
            </Field>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              <Field label="Lương tối thiểu">
                <input
                  type="number"
                  min={0}
                  value={minSalary}
                  onChange={(event) =>
                    setMinSalary(event.target.value)
                  }
                  placeholder="12000000"
                  style={inputStyle}
                />
              </Field>

              <Field label="Lương tối đa">
                <input
                  type="number"
                  min={0}
                  value={maxSalary}
                  onChange={(event) =>
                    setMaxSalary(event.target.value)
                  }
                  placeholder="18000000"
                  style={inputStyle}
                />
              </Field>
            </div>

            {error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "11px",
                  border: "1px solid #efc1bc",
                  borderRadius: "6px",
                  background: "#fff4f2",
                  color: "#b42318",
                  fontSize: "12px",
                }}
              >
                {error}
              </div>
            )}

            <div
              style={{
                marginTop: "18px",
                padding: "10px 12px",
                borderRadius: "6px",
                background: "#f5f8f6",
                color: "#68776f",
                fontSize: "11px",
              }}
            >
              Dải lương phải nằm trong khung đã được công ty phê
              duyệt và sẽ được dùng khi kiểm tra offer tuyển dụng.
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={cancelButton}
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleSaveJob}
                style={primaryButton}
              >
                {editingJob
                  ? "Lưu thay đổi"
                  : "Thêm chức danh"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================
   COMPONENT PHỤ
========================================================= */

function StatCard({
  title,
  value,
  note,
}: {
  title: string;
  value: string;
  note: string;
}) {
  return (
    <div
      style={{
        padding: "18px",
        background: "#ffffff",
        border: "1px solid #e1e8e4",
        borderRadius: "9px",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#748179",
          fontSize: "11px",
        }}
      >
        {title}
      </p>

      <strong
        style={{
          display: "block",
          marginTop: "7px",
          color: "#24684c",
          fontSize: "20px",
        }}
      >
        {value}
      </strong>

      <span
        style={{
          display: "block",
          marginTop: "5px",
          color: "#929c97",
          fontSize: "10px",
        }}
      >
        {note}
      </span>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={{ marginTop: "16px" }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

/* =========================================================
   STYLE
========================================================= */

const thStyle = {
  padding: "12px 14px",
  borderBottom: "1px solid #dde5e1",
  textAlign: "left" as const,
  color: "#59675f",
  fontSize: "12px",
};

const tdStyle = {
  padding: "14px",
  borderBottom: "1px solid #edf1ef",
  color: "#33413a",
  fontSize: "12px",
};

const salaryCell = {
  ...tdStyle,
  color: "#285f47",
  fontWeight: 650,
};

const levelBadge = {
  display: "inline-block",
  padding: "5px 9px",
  borderRadius: "999px",
  background: "#edf5f1",
  color: "#347357",
  fontSize: "11px",
  fontWeight: 600,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "10px 12px",
  border: "1px solid #ccd7d1",
  borderRadius: "6px",
  background: "#ffffff",
};

const labelStyle = {
  display: "block",
  marginBottom: "6px",
  color: "#3e4d45",
  fontSize: "12px",
  fontWeight: 650,
};

const primaryButton = {
  padding: "10px 16px",
  border: "none",
  borderRadius: "7px",
  background: "#267553",
  color: "#ffffff",
  fontWeight: 650,
  cursor: "pointer",
};

const editButton = {
  padding: "7px 11px",
  border: "1px solid #cfd8d3",
  borderRadius: "6px",
  background: "#ffffff",
  cursor: "pointer",
};

const deleteButton = {
  padding: "7px 11px",
  border: "1px solid #efb5b5",
  borderRadius: "6px",
  background: "#fff1f1",
  color: "#b42318",
  cursor: "pointer",
};

const cancelButton = {
  padding: "9px 14px",
  border: "1px solid #ccd7d1",
  borderRadius: "6px",
  background: "#ffffff",
  color: "#46534c",
  cursor: "pointer",
};

export default JobTitleSalaryManagement;