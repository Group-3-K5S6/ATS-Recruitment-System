import { useState } from "react";
import { useNavigate } from "react-router-dom";

import Sidebar from "../components/Sidebar";
import { clearLocalSession } from "../services/session";

type Department = {
  id: string;
  name: string;
  manager: string;
  active: boolean;
  hasOpenRequisition: boolean;
  children?: Department[];
};

const initialDepartments: Department[] = [
  {
    id: "hr",
    name: "Phòng Nhân sự",
    manager: "Nguyễn Thị Lan",
    active: true,
    hasOpenRequisition: true,
    children: [
      {
        id: "recruitment",
        name: "Bộ phận Tuyển dụng",
        manager: "Trần Văn Minh",
        active: true,
        hasOpenRequisition: false,
      },
      {
        id: "cnb",
        name: "Bộ phận C&B",
        manager: "Lê Thị Hoa",
        active: true,
        hasOpenRequisition: false,
      },
    ],
  },
  {
    id: "tech",
    name: "Phòng Công nghệ",
    manager: "Phạm Văn Nam",
    active: true,
    hasOpenRequisition: true,
    children: [
      {
        id: "backend",
        name: "Backend",
        manager: "Nguyễn Đức Anh",
        active: true,
        hasOpenRequisition: false,
      },
      {
        id: "frontend",
        name: "Frontend",
        manager: "Trần Minh Đức",
        active: true,
        hasOpenRequisition: false,
      },
    ],
  },
  {
    id: "marketing",
    name: "Phòng Marketing",
    manager: "Nguyễn Thu Hà",
    active: true,
    hasOpenRequisition: false,
  },
];

function DepartmentManagement() {
  const navigate = useNavigate();

  const [departments, setDepartments] =
    useState<Department[]>(initialDepartments);

  const [showModal, setShowModal] = useState(false);

  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );

  const [departmentName, setDepartmentName] = useState("");

  const [managerName, setManagerName] = useState("");

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

  const openAddModal = () => {
    setEditingDepartment(null);
    setDepartmentName("");
    setManagerName("");
    setShowModal(true);
  };

  const openEditModal = (department: Department) => {
    setEditingDepartment(department);
    setDepartmentName(department.name);
    setManagerName(department.manager);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingDepartment(null);
    setDepartmentName("");
    setManagerName("");
  };

  const handleSaveDepartment = () => {
    if (!departmentName.trim() || !managerName.trim()) {
      alert("Vui lòng nhập đầy đủ tên phòng ban và người phụ trách.");
      return;
    }

    if (editingDepartment) {
      setDepartments((current) =>
        current.map((department) =>
          department.id === editingDepartment.id
            ? {
                ...department,
                name: departmentName.trim(),
                manager: managerName.trim(),
              }
            : {
                ...department,
                children: department.children?.map((child) =>
                  child.id === editingDepartment.id
                    ? {
                        ...child,
                        name: departmentName.trim(),
                        manager: managerName.trim(),
                      }
                    : child,
                ),
              },
        ),
      );
    } else {
      const newDepartment: Department = {
        id: `department-${Date.now()}`,
        name: departmentName.trim(),
        manager: managerName.trim(),
        active: true,
        hasOpenRequisition: false,
      };

      setDepartments((current) => [...current, newDepartment]);
    }

    closeModal();
  };

  const handleDisableDepartment = (id: string) => {
    setDepartments((current) =>
      current.map((department) => {
        if (department.id === id) {
          return {
            ...department,
            active: false,
          };
        }

        return {
          ...department,
          children: department.children?.map((child) =>
            child.id === id
              ? {
                  ...child,
                  active: false,
                }
              : child,
          ),
        };
      }),
    );
  };

  const handleDeleteDepartment = (department: Department) => {
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

    setDepartments((current) =>
      current
        .filter((item) => item.id !== department.id)
        .map((item) => ({
          ...item,
          children: item.children?.filter(
            (child) => child.id !== department.id,
          ),
        })),
    );
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
                Người phụ trách: <strong>{department.manager}</strong>
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
                  onClick={() => handleDisableDepartment(department.id)}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #e5c07b",
                    borderRadius: "6px",
                    background: "#fff8e8",
                    color: "#9a6200",
                    cursor: "pointer",
                  }}
                >
                  Ngừng áp dụng
                </button>
              )}

              <button
                type="button"
                disabled={
                  department.hasOpenRequisition ||
                  Boolean(department.children && department.children.length > 0)
                }
                onClick={() => handleDeleteDepartment(department)}
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
              onClick={openAddModal}
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

            {departments.map((department) => renderDepartment(department))}
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
          }}
        >
          <div
            style={{
              width: "420px",
              maxWidth: "calc(100vw - 32px)",
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
                Người phụ trách
              </label>

              <input
                type="text"
                value={managerName}
                onChange={(event) => setManagerName(event.target.value)}
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
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                onClick={closeModal}
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
                onClick={handleSaveDepartment}
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
                {editingDepartment ? "Lưu thay đổi" : "Thêm phòng ban"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DepartmentManagement;
