import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Role } from "../data/roleMenus";
import Sidebar from "../components/Sidebar";
import { clearLocalSession } from "../services/session";

type RecruitmentStatus =
  | "Đang tuyển"
  | "Đã tuyển đủ"
  | "Tạm dừng"
  | "Đã huỷ";

type JobPostingStatus = "Đang đăng" | "Đã gỡ";
type ActionType = "completed" | "paused" | "cancelled";

type RecruitmentRequest = {
  id: string;
  code: string;
  title: string;
  department: string;
  requiredCount: number;
  hiredCount?: number;
  pipelineCount: number;
  createdAt: string;
  status: RecruitmentStatus;
  jobPostingStatus: JobPostingStatus;
  lastActionReason?: string;
  lastActionNote?: string;
};

type RecruitmentRequestManagementProps = {
  role: Role;
  userName: string;
};

type ActionModalState = {
  request: RecruitmentRequest;
  action: ActionType;
};

type StatusFilter = "Tất cả" | RecruitmentStatus;

const statusOptions: StatusFilter[] = [
  "Tất cả",
  "Đang tuyển",
  "Đã tuyển đủ",
  "Tạm dừng",
  "Đã huỷ",
];

const initialRequests: RecruitmentRequest[] = [
  {
    id: "REQ-2026-001",
    code: "REQ-2026-001",
    title: "Lập trình viên Frontend",
    department: "Công nghệ",
    requiredCount: 2,
    pipelineCount: 4,
    createdAt: "2026-01-14",
    status: "Đang tuyển",
    jobPostingStatus: "Đang đăng",
  },
  {
    id: "REQ-2026-002",
    code: "REQ-2026-002",
    title: "Trưởng nhóm Backend",
    department: "Công nghệ",
    requiredCount: 1,
    pipelineCount: 7,
    createdAt: "2026-01-10",
    status: "Đang tuyển",
    jobPostingStatus: "Đang đăng",
  },
  {
    id: "REQ-2026-003",
    code: "REQ-2026-003",
    title: "Chuyên viên Digital Marketing",
    department: "Marketing",
    requiredCount: 3,
    hiredCount: 3,
    pipelineCount: 0,
    createdAt: "2025-12-20",
    status: "Đã tuyển đủ",
    jobPostingStatus: "Đã gỡ",
    lastActionReason: "Đã đạt đủ số lượng cần tuyển.",
  },
  {
    id: "REQ-2026-004",
    code: "REQ-2026-004",
    title: "Nhân viên Nhân sự",
    department: "Nhân sự",
    requiredCount: 2,
    pipelineCount: 2,
    createdAt: "2026-02-01",
    status: "Tạm dừng",
    jobPostingStatus: "Đã gỡ",
    lastActionReason: "Theo kế hoạch tái điều chỉnh tuyển dụng trong quý.",
  },
  {
    id: "REQ-2026-005",
    code: "REQ-2026-005",
    title: "Kỹ sư QA Automation",
    department: "Công nghệ",
    requiredCount: 2,
    pipelineCount: 5,
    createdAt: "2025-11-16",
    status: "Đã huỷ",
    jobPostingStatus: "Đã gỡ",
    lastActionReason: "Thay đổi mục tiêu tuyển dụng và cắt giảm đầu vào.",
  },
  {
    id: "REQ-2026-006",
    code: "REQ-2026-006",
    title: "Chuyên viên Tài chính",
    department: "Tài chính",
    requiredCount: 1,
    pipelineCount: 1,
    createdAt: "2026-02-08",
    status: "Đang tuyển",
    jobPostingStatus: "Đang đăng",
  },
];

const actionTitleMap: Record<ActionType, string> = {
  completed: "Đã tuyển đủ",
  paused: "Tạm dừng",
  cancelled: "Huỷ yêu cầu tuyển dụng",
};

const actionReasonLabel: Record<ActionType, string> = {
  completed: "Lý do hoàn thành",
  paused: "Lý do tạm dừng",
  cancelled: "Lý do huỷ",
};

const actionSuccessTitle: Record<ActionType, string> = {
  completed: "Yêu cầu đã được đánh dấu đã tuyển đủ",
  paused: "Yêu cầu đã được tạm dừng",
  cancelled: "Yêu cầu đã được huỷ",
};

const actionStatusMap: Record<ActionType, RecruitmentStatus> = {
  completed: "Đã tuyển đủ",
  paused: "Tạm dừng",
  cancelled: "Đã huỷ",
};

function getStatusClassName(status: RecruitmentStatus) {
  switch (status) {
    case "Đang tuyển":
      return "status-blue";
    case "Đã tuyển đủ":
      return "status-green";
    case "Tạm dừng":
      return "status-orange";
    case "Đã huỷ":
      return "status-red";
    default:
      return "status-blue";
  }
}

function getPostingClassName(status: JobPostingStatus) {
  return status === "Đang đăng" ? "status-blue" : "status-red";
}

function getAllowedActions(status: RecruitmentStatus): ActionType[] {
  switch (status) {
    case "Đang tuyển":
      return ["completed", "paused", "cancelled"];
    case "Đã tuyển đủ":
      return ["paused", "cancelled"];
    case "Tạm dừng":
      return ["completed", "cancelled"];
    case "Đã huỷ":
      return [];
    default:
      return [];
  }
}

function getActionButtonLabel(action: ActionType) {
  switch (action) {
    case "completed":
      return "Đã tuyển đủ";
    case "paused":
      return "Tạm dừng";
    case "cancelled":
      return "Huỷ";
    default:
      return "";
  }
}

export default function RecruitmentRequestManagement({
  role,
  userName,
}: RecruitmentRequestManagementProps) {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<RecruitmentRequest[]>(initialRequests);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tất cả");
  const [modalState, setModalState] = useState<ActionModalState | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [showPipelineWarning, setShowPipelineWarning] = useState(false);
  const [pipelineReviewed, setPipelineReviewed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(
    null,
  );

  const closeModal = useCallback(() => {
    if (isSaving) {
      return;
    }

    setModalState(null);
    setReason("");
    setNote("");
    setReasonError("");
    setShowPipelineWarning(false);
    setPipelineReviewed(false);
    setIsSaving(false);
  }, [isSaving]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setToast(null);
    }, 3500);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [toast]);

  useEffect(() => {
    if (!modalState) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalState, closeModal]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLowerCase();

    return requests.filter((request) => {
      const matchesSearch =
        !normalizedQuery ||
        request.code.toLowerCase().includes(normalizedQuery) ||
        request.title.toLowerCase().includes(normalizedQuery);

      const matchesStatus =
        statusFilter === "Tất cả" || request.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [requests, searchTerm, statusFilter]);

  const openActionModal = (request: RecruitmentRequest, action: ActionType) => {
    setModalState({ request, action });
    setReason("");
    setNote("");
    setReasonError("");
    setShowPipelineWarning(false);
    setPipelineReviewed(false);
  };

  const handleConfirmAction = async () => {
    if (!modalState || isSaving) {
      return;
    }

    const cleanedReason = reason.trim();

    if (!cleanedReason) {
      setReasonError("Vui lòng nhập lý do để tiếp tục.");
      return;
    }

    if (modalState.request.pipelineCount > 0 && !pipelineReviewed) {
      setShowPipelineWarning(true);
      return;
    }

    setIsSaving(true);

    await new Promise((resolve) => {
      window.setTimeout(resolve, 500);
    });

    setRequests((previousRequests) =>
      previousRequests.map((request) => {
        if (request.id !== modalState.request.id) {
          return request;
        }

        const nextStatus = actionStatusMap[modalState.action];

        return {
          ...request,
          status: nextStatus,
          jobPostingStatus:
            request.jobPostingStatus === "Đang đăng" ? "Đã gỡ" : request.jobPostingStatus,
          lastActionReason: cleanedReason,
          lastActionNote: note.trim() || request.lastActionNote,
        };
      }),
    );

    const successMessage =
      modalState.action === "completed"
        ? "Yêu cầu đã được đánh dấu là đã tuyển đủ. Tin đăng trong dữ liệu mô phỏng đã được gỡ." 
        : modalState.action === "paused"
          ? "Yêu cầu đã được tạm dừng. Tin đăng trong dữ liệu mô phỏng đã được đánh dấu là đã gỡ." 
          : "Yêu cầu đã được huỷ. Người dùng nên kiểm tra và xử lý hồ sơ đang tồn đọng trước khi đóng tiếp.";

    setToast({
      title: actionSuccessTitle[modalState.action],
      message: successMessage,
    });

    closeModal();
  };

  const handleLogout = async () => {
    clearLocalSession();
    navigate("/login");
  };

  return (
    <div className="dashboard-layout">
      <Sidebar
        role={role}
        userName={userName}
        onLogout={handleLogout}
        selectedMenu="Yêu cầu tuyển dụng"
      />

      <main className="dashboard-content">
        <div className="recruitment-page">
          <header className="recruitment-header">
            <div>
              <p className="recruitment-kicker">QUẢN LÝ TUYỂN DỤNG</p>
              <h1>Quản lý yêu cầu tuyển dụng</h1>
            </div>
          </header>

          <section className="dashboard-panel recruitment-panel">
            <div className="recruitment-toolbar">
              <div className="recruitment-search-box">
                <label htmlFor="recruitment-search">Tìm kiếm</label>
                <input
                  id="recruitment-search"
                  type="text"
                  placeholder="Nhập mã yêu cầu hoặc vị trí"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </div>

              <div className="recruitment-filter-box">
                <label htmlFor="recruitment-status-filter">Trạng thái</label>
                <select
                  id="recruitment-status-filter"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="recruitment-table-wrap">
              <table className="dashboard-table recruitment-table">
                <thead>
                  <tr>
                    <th>Mã yêu cầu</th>
                    <th>Vị trí tuyển dụng</th>
                    <th>Phòng ban</th>
                    <th>Số lượng</th>
                    <th>Pipeline</th>
                    <th>Ngày tạo</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRequests.map((request) => {
                    const allowedActions = getAllowedActions(request.status);

                    return (
                      <tr key={request.id}>
                        <td>
                          <strong>{request.code}</strong>
                        </td>
                        <td>{request.title}</td>
                        <td>{request.department}</td>
                        <td>{request.requiredCount}</td>
                        <td>{request.pipelineCount}</td>
                        <td>{request.createdAt}</td>
                        <td>
                          <div className="recruitment-status-stack">
                            <span className={getStatusClassName(request.status)}>
                              {request.status}
                            </span>
                            <span className={getPostingClassName(request.jobPostingStatus)}>
                              Tin đăng: {request.jobPostingStatus}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="recruitment-action-group">
                            {allowedActions.length === 0 ? (
                              <span className="recruitment-empty-action">Không có thao tác</span>
                            ) : (
                              allowedActions.map((action) => (
                                <button
                                  key={action}
                                  type="button"
                                  className={`recruitment-action-button ${action}`}
                                  onClick={() => openActionModal(request, action)}
                                >
                                  {getActionButtonLabel(action)}
                                </button>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredRequests.length === 0 && (
              <div className="recruitment-empty-state">
                Không tìm thấy yêu cầu tuyển dụng phù hợp với điều kiện lọc.
              </div>
            )}
          </section>
        </div>

        {modalState && (
          <div
            className="recruitment-modal-backdrop"
            onClick={() => {
              if (!isSaving) {
                closeModal();
              }
            }}
          >
            <div
              className="recruitment-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="recruitment-modal-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="recruitment-modal-close"
                aria-label="Đóng modal"
                onClick={closeModal}
                disabled={isSaving}
              >
                ×
              </button>

              <div className="recruitment-modal-header">
                <div>
                  <p className="recruitment-modal-kicker">THAO TÁC</p>
                  <h3 id="recruitment-modal-title">{actionTitleMap[modalState.action]}</h3>
                </div>
                <span className={getStatusClassName(actionStatusMap[modalState.action])}>
                  {actionStatusMap[modalState.action]}
                </span>
              </div>

              {showPipelineWarning ? (
                <>
                  <div className="recruitment-warning-box dangerous has-pipeline" role="alert">
                    <strong>Cần kiểm tra ứng viên trước khi tiếp tục</strong>
                    <p>
                      Yêu cầu này còn <b>{modalState.request.pipelineCount}</b> ứng viên
                      chưa xử lý trong pipeline. Hãy quay lại kiểm tra hồ sơ. Không có
                      hồ sơ nào được tự động xử lý trong bước mô phỏng này.
                    </p>
                  </div>

                  <div className="recruitment-modal-actions">
                    <button
                      type="button"
                      className="recruitment-secondary-button"
                      onClick={() => {
                        setShowPipelineWarning(false);
                        setPipelineReviewed(false);
                      }}
                    >
                      Quay lại kiểm tra hồ sơ
                    </button>
                    <button
                      type="button"
                      className="recruitment-primary-button"
                      onClick={() => {
                        setShowPipelineWarning(false);
                        setPipelineReviewed(true);
                      }}
                    >
                      Đã kiểm tra, tiếp tục
                    </button>
                  </div>
                </>
              ) : (
                <>
              <div className="recruitment-request-card">
                <div className="recruitment-request-row">
                  <span className="recruitment-request-label">Mã</span>
                  <strong>{modalState.request.code}</strong>
                </div>
                <div className="recruitment-request-row">
                  <span className="recruitment-request-label">Vị trí</span>
                  <strong>{modalState.request.title}</strong>
                </div>
                <div className="recruitment-request-row">
                  <span className="recruitment-request-label">Phòng ban</span>
                  <span>{modalState.request.department}</span>
                </div>
                <div className="recruitment-request-row">
                  <span className="recruitment-request-label">Số lượng</span>
                  <span>
                    {modalState.action === "completed" &&
                    modalState.request.hiredCount !== undefined
                      ? `${modalState.request.hiredCount} đã tuyển / `
                      : ""}
                    {modalState.request.requiredCount} cần tuyển
                  </span>
                </div>
              </div>

              <div
                className={`recruitment-warning-box ${
                  modalState.action === "cancelled" ? "dangerous" : ""
                } ${modalState.request.pipelineCount > 0 ? "has-pipeline" : "no-pipeline"}`}
              >
                {modalState.request.pipelineCount > 0 ? (
                  <>
                    <strong>Cảnh báo hồ sơ đang tồn đọng</strong>
                    <p>
                      Còn <b>{modalState.request.pipelineCount}</b> ứng viên trong pipeline. Vui
                      lòng kiểm tra và xử lý trước khi thực hiện thao tác này.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Không còn ứng viên trong pipeline</strong>
                    <p>Không còn hồ sơ cần xử lý trước khi đóng yêu cầu này.</p>
                  </>
                )}
              </div>

              <div className="recruitment-modal-field">
                <label htmlFor="recruitment-reason">{actionReasonLabel[modalState.action]}</label>
                <textarea
                  id="recruitment-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (reasonError) {
                      setReasonError("");
                    }
                  }}
                  rows={4}
                  placeholder={
                    modalState.action === "completed"
                      ? "Nhập lý do yêu cầu đã đạt đủ số lượng..."
                      : modalState.action === "paused"
                        ? "Nhập lý do tạm dừng tuyển dụng..."
                        : "Nhập lý do huỷ yêu cầu..."
                  }
                />
                {reasonError && <span className="recruitment-error-message">{reasonError}</span>}
              </div>

              <div className="recruitment-modal-field">
                <label htmlFor="recruitment-note">Ghi chú bổ sung (tùy chọn)</label>
                <textarea
                  id="recruitment-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Thêm ghi chú nếu cần ghi nhận trước khi đóng tuyển dụng..."
                />
              </div>

              <div
                className={`recruitment-instruction-box ${modalState.action}`}
              >
                {modalState.action === "paused" && (
                  <p>
                    Tin tuyển dụng trong dữ liệu mô phỏng sẽ được đánh dấu là <strong>Đã gỡ</strong> sau khi xác nhận.
                  </p>
                )}
                {modalState.action === "completed" && (
                  <p>
                    Yêu cầu sẽ được cập nhật thành <strong>Đã tuyển đủ</strong> và tin đăng mô phỏng được đánh dấu đã gỡ nếu đang được hiển thị.
                  </p>
                )}
                {modalState.action === "cancelled" && (
                  <p>
                    Yêu cầu sẽ chuyển sang trạng thái <strong>Đã huỷ</strong>. Tin đăng đang hoạt động, nếu có, sẽ được đánh dấu đã gỡ trong dữ liệu mô phỏng; hồ sơ tồn đọng không được tự động xử lý.
                  </p>
                )}
              </div>

              <div className="recruitment-modal-actions">
                <button
                  type="button"
                  className="recruitment-secondary-button"
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="recruitment-primary-button"
                  onClick={handleConfirmAction}
                  disabled={isSaving}
                >
                  {isSaving ? "Đang xử lý..." : modalState.action === "cancelled" ? "Xác nhận huỷ" : "Xác nhận"}
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="recruitment-toast" role="status" aria-live="polite">
            <div className="recruitment-toast-icon">✓</div>
            <div>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
