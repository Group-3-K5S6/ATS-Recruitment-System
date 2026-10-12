import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import type { Role } from "../data/roleMenus";
import { clearLocalSession } from "../services/session";

type Props = {
  role: Role;
  userName: string;
};

type CategoryKey =
  | "nguonUngVien"
  | "lyDoLoai"
  | "diaDiem"
  | "hinhThuc";

type CategoryValue = {
  id: string;
  name: string;
  isReferenced: boolean;
};

type CategoryData = Record<CategoryKey, CategoryValue[]>;

const categories: {
  key: CategoryKey;
  title: string;
  description: string;
}[] = [
  {
    key: "nguonUngVien",
    title: "Nguồn ứng viên",
    description: "Quản lý các nguồn tiếp nhận ứng viên.",
  },
  {
    key: "lyDoLoai",
    title: "Lý do loại hồ sơ",
    description: "Quản lý các lý do loại hồ sơ ứng viên.",
  },
  {
    key: "diaDiem",
    title: "Địa điểm làm việc",
    description: "Quản lý địa điểm tuyển dụng và làm việc.",
  },
  {
    key: "hinhThuc",
    title: "Hình thức làm việc",
    description: "Quản lý các hình thức làm việc.",
  },
];

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";
const initialData: CategoryData = {
  nguonUngVien: [], lyDoLoai: [], diaDiem: [], hinhThuc: [],
};
type ApiItem = CategoryValue & { category: CategoryKey; position: number };
type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const token = sessionStorage.getItem("accessToken");
  if (!token) throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
  const response = await fetch(`${API_URL}/api/shared-categories${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error?.message || "Không thể cập nhật danh mục.");
  }
  return result.data;
}

export default function RecruitmentSharedCategories({
  role,
  userName,
}: Props) {
  const navigate = useNavigate();

  const [activeCategory, setActiveCategory] =
    useState<CategoryKey>("nguonUngVien");

  const [data, setData] =
    useState<CategoryData>(initialData);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const items = await api<ApiItem[]>("");
    const grouped: CategoryData = {
      nguonUngVien: [], lyDoLoai: [], diaDiem: [], hinhThuc: [],
    };
    items.forEach(item => {
      if (item.category in grouped) grouped[item.category].push(item);
    });
    setData(grouped);
  };

  useEffect(() => {
    let mounted = true;
    api<ApiItem[]>("").then(items => {
      if (!mounted) return;
      const grouped: CategoryData = {
        nguonUngVien: [], lyDoLoai: [], diaDiem: [], hinhThuc: [],
      };
      items.forEach(item => {
        if (item.category in grouped) grouped[item.category].push(item);
      });
      setData(grouped);
    }).catch(error => { if (mounted) { setMessage(error instanceof Error ? error.message : "Không tải được danh mục."); setIsError(true); } })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const [inputName, setInputName] = useState("");

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [message, setMessage] = useState("");

  const [isError, setIsError] = useState(false);

  const currentCategory = categories.find(
    (category) => category.key === activeCategory
  )!;

  const currentItems = data[activeCategory];
  // Trạng thái tải được thể hiện trong vùng thông báo chung.
  const isLoadingCategories = loading;

  const showMessage = (
    text: string,
    error = false
  ) => {
    setMessage(text);
    setIsError(error);
  };

  const resetForm = () => {
    setInputName("");
    setEditingId(null);
  };

  const changeCategory = (key: CategoryKey) => {
    setActiveCategory(key);
    resetForm();
    setMessage("");
  };

  // S2-08: ghi thay đổi vào Backend/SQLite, không còn tạo thành công giả trên FE.
  const handleSave = async () => {
    const name = inputName.trim();
    if (!name) { showMessage("Vui lòng nhập tên giá trị danh mục.", true); return; }
    if (currentItems.some(item => item.name.toLowerCase() === name.toLowerCase() && item.id !== editingId)) {
      showMessage("Giá trị này đã tồn tại trong danh mục.", true); return;
    }
    try {
      if (editingId) {
        await api(`/${editingId}`, "PUT", { name });
      } else {
        await api("", "POST", { category: activeCategory, name });
      }
      await reload();
      resetForm();
      showMessage("Đã lưu giá trị danh mục vào hệ thống.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Không lưu được danh mục.", true);
    }
  };

  const handleEdit = (item: CategoryValue) => {
    setEditingId(item.id);
    setInputName(item.name);
    setMessage("");
  };

  const handleDelete = async (item: CategoryValue) => {
    if (item.isReferenced) {
      showMessage("Không thể xóa giá trị đang được tham chiếu.", true); return;
    }
    if (!window.confirm(`Bạn có chắc muốn xóa "${item.name}" không?`)) return;
    try {
      await api(`/${item.id}`, "DELETE");
      await reload();
      if (editingId === item.id) resetForm();
      showMessage("Đã xóa giá trị danh mục.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Không thể xóa giá trị.", true);
    }
  };

  const handleMove = async (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentItems.length) return;
    const ordered = [...currentItems];
    [ordered[index], ordered[newIndex]] = [ordered[newIndex], ordered[index]];
    try {
      await api("/reorder", "PUT", { category: activeCategory, ids: ordered.map(item => item.id) });
      await reload();
      showMessage("Đã lưu thứ tự hiển thị.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Không thể lưu thứ tự.", true);
    }
  };

  const handleLogout = async (): Promise<void> => {
  clearLocalSession();
  navigate("/login");
};
  const handleMenuSelect = (label: string) => {
    const routes: Record<string, string> = {
      "Tổng quan": "/dashboard",
      "Phòng ban & tổ chức": "/departments",
      "Chức danh & dải lương": "/job-titles",
      "Khung năng lực": "/competency-frameworks",
      "Ngân hàng câu hỏi phỏng vấn":
        "/interview-question-bank",
      "Danh mục dùng chung tuyển dụng":
        "/recruitment-shared-categories",
      "Hồ sơ cá nhân": "/profile",
    };

    const path = routes[label];

    if (path) {
      navigate(path);
    }
  };

  return (
    <div className="shared-page">
      <style>
        {`
          .shared-page {
            display: flex;
            min-height: 100vh;
            background: #f5f7fb;
          }

         .shared-main {
  flex: 1;
  min-width: 0;
  margin-left: 280px;
  box-sizing: border-box;
  padding: 36px 48px;
}

          .shared-container {
            max-width: 1250px;
            margin: 0 auto;
          }

          .shared-title {
            font-size: 30px;
            font-weight: 700;
            margin: 0;
            color: #0f172a;
          }

          .shared-description {
            margin-top: 10px;
            color: #64748b;
            font-size: 14px;
          }

          .shared-card {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 24px;
            margin-top: 24px;
          }

          .shared-tabs {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 12px;
            margin-top: 24px;
          }

          .shared-tab {
            padding: 16px 12px;
            border-radius: 10px;
            border: 1px solid #dbe3ef;
            background: white;
            color: #334155;
            font-weight: 600;
            cursor: pointer;
          }

          .shared-tab.active {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
          }

          .shared-tab:hover:not(.active) {
            background: #eff6ff;
          }

          .shared-form {
            display: flex;
            align-items: end;
            gap: 14px;
            margin-top: 20px;
          }

          .shared-input-group {
            flex: 1;
          }

          .shared-input-group label {
            display: block;
            font-weight: 600;
            margin-bottom: 8px;
          }

          .shared-input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 12px;
            font-size: 14px;
          }

          .shared-btn {
            border: none;
            border-radius: 8px;
            padding: 11px 16px;
            font-weight: 600;
            cursor: pointer;
          }

          .shared-btn-primary {
            background: #2563eb;
            color: white;
          }

          .shared-btn-secondary {
            background: #e2e8f0;
            color: #334155;
          }

          .shared-btn-danger {
            background: #fef2f2;
            color: #dc2626;
            border: 1px solid #fecaca;
          }

          .shared-btn:disabled {
            opacity: 0.4;
            cursor: not-allowed;
          }

          .shared-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 18px;
          }

          .shared-table th {
            text-align: left;
            background: #f8fafc;
            color: #475569;
            font-size: 14px;
            padding: 14px;
            border-bottom: 1px solid #e2e8f0;
          }

          .shared-table td {
            padding: 14px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 14px;
          }

          .shared-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }

          .shared-status {
            display: inline-block;
            border-radius: 20px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 600;
          }

          .shared-status-used {
            color: #b45309;
            background: #fffbeb;
          }

          .shared-status-free {
            color: #15803d;
            background: #f0fdf4;
          }

          .shared-message {
            padding: 12px 16px;
            border-radius: 8px;
            margin-top: 16px;
            font-size: 14px;
          }

          .shared-note {
            margin-top: 12px;
            font-size: 13px;
            color: #64748b;
          }

          @media (max-width: 1000px) {
            .shared-main {
              padding: 24px 18px;
            }

            .shared-tabs {
              grid-template-columns: repeat(2, 1fr);
            }

            .shared-form {
              flex-direction: column;
              align-items: stretch;
            }

            .shared-table-wrapper {
              overflow-x: auto;
            }

            .shared-table {
              min-width: 800px;
            }
          }

          @media (max-width: 550px) {
            .shared-tabs {
              grid-template-columns: 1fr;
            }
          }
        `}
      </style>

      <Sidebar
        role={role}
        userName={userName}
        selectedMenu="Danh mục dùng chung tuyển dụng"
        onMenuSelect={handleMenuSelect}
        onLogout={handleLogout}
      />

      <main className="shared-main">
        <div className="shared-container">
          <h1 className="shared-title">
            Quản lý danh mục dùng chung tuyển dụng
          </h1>

          <p className="shared-description">
            Thống nhất các giá trị sử dụng trong
            quy trình tuyển dụng.
          </p>

          <div className="shared-tabs">
            {categories.map((category) => (
              <button
                key={category.key}
                type="button"
                className={`shared-tab ${
                  activeCategory === category.key
                    ? "active"
                    : ""
                }`}
                onClick={() =>
                  changeCategory(category.key)
                }
              >
                {category.title}
              </button>
            ))}
          </div>

          <section className="shared-card">
            <h2 style={{ marginTop: 0 }}>
              {currentCategory.title}
            </h2>

            <p style={{ color: "#64748b" }}>
              {currentCategory.description}
            </p>

            <div className="shared-form">
              <div className="shared-input-group">
                <label htmlFor="category-name">
                  Tên giá trị danh mục
                </label>

                <input
                  id="category-name"
                  className="shared-input"
                  value={inputName}
                  onChange={(event) =>
                    setInputName(event.target.value)
                  }
                  placeholder="Nhập tên giá trị..."
                />
              </div>

              <button
                type="button"
                className="shared-btn shared-btn-primary"
                onClick={handleSave}
              >
                {editingId
                  ? "Lưu thay đổi"
                  : "+ Thêm giá trị"}
              </button>

              {editingId && (
                <button
                  type="button"
                  className="shared-btn shared-btn-secondary"
                  onClick={resetForm}
                >
                  Hủy
                </button>
              )}
            </div>

            {isLoadingCategories && <p role="status">Đang tải danh mục...</p>}
          {message && (
              <div
                className="shared-message"
                style={{
                  background: isError
                    ? "#fef2f2"
                    : "#f0fdf4",
                  color: isError
                    ? "#dc2626"
                    : "#15803d",
                }}
              >
                {message}
              </div>
            )}
          </section>

          <section className="shared-card">
            <h2 style={{ marginTop: 0 }}>
              Danh sách giá trị
            </h2>

            <div className="shared-table-wrapper">
              <table className="shared-table">
                <thead>
                  <tr>
                    <th>STT</th>
                    <th>Tên giá trị</th>
                    <th>Trạng thái tham chiếu</th>
                    <th>Thứ tự hiển thị</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {currentItems.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        Chưa có giá trị nào.
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>

                        <td>
                          <strong>{item.name}</strong>
                        </td>

                        <td>
                          <span
                            className={`shared-status ${
                              item.isReferenced
                                ? "shared-status-used"
                                : "shared-status-free"
                            }`}
                          >
                            {item.isReferenced
                              ? "Đang được tham chiếu"
                              : "Chưa được tham chiếu"}
                          </span>
                        </td>

                        <td>
                          <div className="shared-actions">
                            <button
                              type="button"
                              className="shared-btn shared-btn-secondary"
                              disabled={index === 0}
                              onClick={() =>
                                handleMove(index, "up")
                              }
                              title="Di chuyển lên"
                            >
                              ↑
                            </button>

                            <button
                              type="button"
                              className="shared-btn shared-btn-secondary"
                              disabled={
                                index ===
                                currentItems.length - 1
                              }
                              onClick={() =>
                                handleMove(index, "down")
                              }
                              title="Di chuyển xuống"
                            >
                              ↓
                            </button>
                          </div>
                        </td>

                        <td>
                          <div className="shared-actions">
                            <button
                              type="button"
                              className="shared-btn shared-btn-secondary"
                              onClick={() =>
                                handleEdit(item)
                              }
                            >
                              Sửa
                            </button>

                            <button
                              type="button"
                              className="shared-btn shared-btn-danger"
                              disabled={item.isReferenced}
                              onClick={() =>
                                handleDelete(item)
                              }
                              title={
                                item.isReferenced
                                  ? "Không thể xóa giá trị đang được tham chiếu"
                                  : "Xóa giá trị"
                              }
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>


          </section>
        </div>
      </main>
    </div>
  );
}