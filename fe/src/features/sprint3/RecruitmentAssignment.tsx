import { useEffect, useMemo, useState } from "react";
import {
  Search,
  UserRoundCheck,
  Users,
  X,
  AlertCircle,
  History,
} from "lucide-react";

import { atsApi, type Requisition } from "./api";
import "./recruitment-assignment.css";

type RecruiterUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  roles: string[];
  department?: {
    id?: string;
    name?: string;
  } | null;
};

type AssignmentDraft = {
  primaryRecruiterId: string;
  supportRecruiterIds: string[];
};

function RecruitmentAssignment() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterUser[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [selectedRequisition, setSelectedRequisition] =
    useState<Requisition | null>(null);

  const [draft, setDraft] = useState<AssignmentDraft>({
    primaryRecruiterId: "",
    supportRecruiterIds: [],
  });

  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError("");

        const [requisitionData, userData] = await Promise.all([
          atsApi<Requisition[]>("/api/requisitions"),
          atsApi<RecruiterUser[]>("/api/users"),
        ]);

        setRequisitions(requisitionData);

        setRecruiters(
          userData.filter(
            (user) =>
              user.isActive === true &&
              Array.isArray(user.roles) &&
              user.roles.includes("RECRUITER"),
          ),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Không thể tải dữ liệu phân công tuyển dụng.",
        );
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const filteredRequisitions = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return requisitions;
    }

    return requisitions.filter((item) => {
      const departmentName = item.department?.name ?? "";

      return (
        item.title.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword) ||
        departmentName.toLowerCase().includes(keyword)
      );
    });
  }, [requisitions, search]);

  const primaryRecruiter = recruiters.find(
    (user) => user.id === draft.primaryRecruiterId,
  );

  const openAssignment = (requisition: Requisition) => {
    setSelectedRequisition(requisition);

    setDraft({
      primaryRecruiterId: "",
      supportRecruiterIds: [],
    });

    setSaveMessage("");
  };

  const closeAssignment = () => {
    setSelectedRequisition(null);
    setSaveMessage("");
  };

  const toggleSupportRecruiter = (recruiterId: string) => {
    setDraft((current) => {
      const exists = current.supportRecruiterIds.includes(recruiterId);

      return {
        ...current,
        supportRecruiterIds: exists
          ? current.supportRecruiterIds.filter((id) => id !== recruiterId)
          : [...current.supportRecruiterIds, recruiterId],
      };
    });
  };

  const handlePrimaryRecruiterChange = (recruiterId: string) => {
    setDraft((current) => ({
      primaryRecruiterId: recruiterId,
      supportRecruiterIds: current.supportRecruiterIds.filter(
        (id) => id !== recruiterId,
      ),
    }));
  };

  const handleSave = () => {
    if (!draft.primaryRecruiterId) {
      setSaveMessage("Vui lòng chọn recruiter chính.");
      return;
    }

    setSaveMessage(
      "Backend hiện chưa có API lưu phân công recruiter. Dữ liệu chưa được gửi hoặc lưu vào hệ thống.",
    );
  };

  if (loading) {
    return (
      <section className="s306-page">
        <div className="s306-state">Đang tải dữ liệu phân công...</div>
      </section>
    );
  }

  return (
    <section className="s306-page">
      <header className="s306-header">
        <div>

          <h1>Phân công tuyển dụng</h1>
          <p>
            Phân công recruiter chính và recruiter hỗ trợ cho từng yêu cầu tuyển
            dụng.
          </p>
        </div>

        <div className="s306-summary">
          <Users size={20} />
          <div>
            <strong>{recruiters.length}</strong>
            <span>Recruiter đang hoạt động</span>
          </div>
        </div>
      </header>

      {error && (
        <div className="s306-alert s306-alert-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="s306-toolbar">
        <div className="s306-search">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Tìm theo tên yêu cầu, phòng ban hoặc mã..."
          />
        </div>

        <span className="s306-count">
          {filteredRequisitions.length} yêu cầu
        </span>
      </div>

      <div className="s306-table-wrapper">
        <table className="s306-table">
          <thead>
            <tr>
              <th>Yêu cầu tuyển dụng</th>
              <th>Phòng ban</th>
              <th>Số lượng</th>
              <th>Trạng thái</th>
              <th>Người phụ trách</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            {filteredRequisitions.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="s306-request-name">
                    <strong>{item.title}</strong>
                    <span>{item.id}</span>
                  </div>
                </td>

                <td>{item.department?.name || "Chưa xác định"}</td>

                <td>{item.headcount ?? "-"}</td>

                <td>
                  <span className="s306-status">{item.status}</span>
                </td>

                <td>
                  <span className="s306-unassigned">Chưa có dữ liệu phân công</span>
                </td>

                <td>
                  <button
                    type="button"
                    className="s306-assign-button"
                    onClick={() => openAssignment(item)}
                  >
                    <UserRoundCheck size={17} />
                    Phân công
                  </button>
                </td>
              </tr>
            ))}

            {filteredRequisitions.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <div className="s306-empty">
                    Không tìm thấy yêu cầu tuyển dụng phù hợp.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRequisition && (
        <div className="s306-modal-backdrop">
          <div className="s306-modal">
            <div className="s306-modal-header">
              <div>
                <p className="s306-eyebrow">Phân công recruiter</p>
                <h2>{selectedRequisition.title}</h2>
                <span>
                  {selectedRequisition.department?.name || "Chưa xác định phòng ban"}
                </span>
              </div>

              <button
                type="button"
                className="s306-icon-button"
                onClick={closeAssignment}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <div className="s306-form-section">
              <label htmlFor="primaryRecruiter">
                Recruiter chính <span>*</span>
              </label>

              <select
                id="primaryRecruiter"
                value={draft.primaryRecruiterId}
                onChange={(event) =>
                  handlePrimaryRecruiterChange(event.target.value)
                }
              >
                <option value="">-- Chọn recruiter chính --</option>

                {recruiters.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} - {user.email}
                  </option>
                ))}
              </select>

              {primaryRecruiter && (
                <div className="s306-primary-preview">
                  <UserRoundCheck size={18} />
                  <div>
                    <strong>{primaryRecruiter.fullName}</strong>
                    <span>{primaryRecruiter.email}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="s306-form-section">
              <div className="s306-section-title">
                <div>
                  <label>Recruiter hỗ trợ</label>
                  <p>Có thể chọn nhiều người.</p>
                </div>

                <span>{draft.supportRecruiterIds.length} đã chọn</span>
              </div>

              <div className="s306-recruiter-list">
                {recruiters
                  .filter((user) => user.id !== draft.primaryRecruiterId)
                  .map((user) => {
                    const checked = draft.supportRecruiterIds.includes(user.id);

                    return (
                      <label className="s306-recruiter-option" key={user.id}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleSupportRecruiter(user.id)}
                        />

                        <div>
                          <strong>{user.fullName}</strong>
                          <span>{user.email}</span>
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>

            <div className="s306-history">
              <div className="s306-history-title">
                <History size={18} />
                <strong>Lịch sử chuyển giao</strong>
              </div>

              <p>
                Backend hiện chưa cung cấp API lịch sử phân công recruiter nên
                chưa có dữ liệu để hiển thị.
              </p>
            </div>

            {saveMessage && (
              <div className="s306-alert s306-alert-warning">
                <AlertCircle size={18} />
                <span>{saveMessage}</span>
              </div>
            )}

            <div className="s306-modal-footer">
              <button
                type="button"
                className="s306-secondary-button"
                onClick={closeAssignment}
              >
                Hủy
              </button>

              <button
                type="button"
                className="s306-primary-button"
                onClick={handleSave}
              >
                Lưu phân công
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default RecruitmentAssignment;