import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Role } from "../data/roleMenus";
import Sidebar from "../components/Sidebar";
import { clearLocalSession } from "../services/session";
import { atsApi, fromError } from "../features/sprint3/api";

type RecruitmentStatus =
  | "Đang tuyển"
  | "Đã tuyển đủ"
  | "Tạm dừng"
  | "Đã huỷ";

type ActionType = "completed" | "paused" | "cancelled";

type RecruitmentRequest = {
  id: string;
  code: string;
  title: string;
  department: string;
  requiredCount: number;
  createdAt: string;
  status: RecruitmentStatus;
  backendStatus: string;
};

type ApprovalTrackingRequest = {
  id: string;
  title: string;
  status: string;
  headcount?: number;
  createdAt?: string;
  approvalChain?: string | null;
  department?: { name: string } | null;
};

type ApprovalChainStep = {
  step: number;
  approverId: string;
  status: string;
  decisionAt?: string | null;
  notes?: string | null;
};

type ApprovalPerson = {
  id: string;
  fullName: string;
  email?: string;
};

type ApprovalHistoryEntry = {
  id: string;
  decision: string;
  step: number;
  fromStatus: string;
  toStatus: string;
  actor: ApprovalPerson | null;
  notes: string | null;
  processedAt: string;
};

type ApprovalHistoryResponse = {
  requisitionId: string;
  title: string;
  currentStatus: string;
  approvalChain: string | null;
  department: { id: string; name: string; code: string } | null;
  hiringManager: ApprovalPerson | null;
  designatedApprover: ApprovalPerson | null;
  currentPendingApprover: ApprovalPerson | null;
  totalSteps: number;
  history: ApprovalHistoryEntry[];
};

type ApprovalChainParseResult = {
  steps: ApprovalChainStep[];
  issue: string | null;
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

type CloseRequisitionResult = {
  id?: string;
  status?: string;
  warning?: boolean;
  activeCandidateCount?: number;
  unpublishedJobCount?: number;
};

function displayRecruitmentStatus(status: string): RecruitmentStatus {
  if (status === "FILLED") return "Đã tuyển đủ";
  if (status === "ON_HOLD") return "Tạm dừng";
  if (status === "CANCELLED") return "Đã huỷ";
  return "Đang tuyển";
}

function toRecruitmentRequest(item: ApprovalTrackingRequest): RecruitmentRequest {
  return {
    id: item.id,
    code: item.id,
    title: item.title,
    department: item.department?.name || "Chưa xác định",
    requiredCount: item.headcount ?? 0,
    createdAt: item.createdAt?.slice(0, 10) || "Chưa xác định",
    status: displayRecruitmentStatus(item.status),
    backendStatus: item.status,
  };
}

const closeApiActions: Record<ActionType, "FILLED" | "ON_HOLD" | "CANCEL"> = {
  completed: "FILLED",
  paused: "ON_HOLD",
  cancelled: "CANCEL",
};

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

function getApprovalStatusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Nháp",
    PENDING_APPROVAL: "Chờ phê duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    CHANGES_REQUESTED: "Chờ bổ sung",
    CANCELLED: "Đã huỷ",
    ON_HOLD: "Tạm dừng",
    FILLED: "Đã tuyển đủ",
  };

  return labels[status] || status;
}

function getApprovalDecisionLabel(decision: string) {
  const labels: Record<string, string> = {
    APPROVE: "Đã duyệt",
    REJECT: "Từ chối",
    REQUEST_CHANGES: "Yêu cầu bổ sung",
  };

  return labels[decision] || decision;
}

function getApprovalChainStatusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Đang chờ xử lý",
    WAITING: "Chưa đến lượt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
    CHANGES_REQUESTED: "Yêu cầu bổ sung",
  };

  return labels[status] || status;
}

function isApprovalChainStep(value: unknown): value is ApprovalChainStep {
  if (
    typeof value !== "object" ||
    value === null ||
    !("step" in value) ||
    !("approverId" in value) ||
    !("status" in value) ||
    typeof value.step !== "number" ||
    typeof value.approverId !== "string" ||
    typeof value.status !== "string"
  ) {
    return false;
  }

  return (
    (!("decisionAt" in value) ||
      value.decisionAt === null ||
      typeof value.decisionAt === "string") &&
    (!("notes" in value) ||
      value.notes === null ||
      typeof value.notes === "string")
  );
}

function parseApprovalChain(
  value: string | null | undefined,
): ApprovalChainParseResult {
  if (!value) {
    return {
      steps: [],
      issue: "Yêu cầu cũ hoặc duyệt một cấp không có snapshot. Các quyết định thực tế được hiển thị trong lịch sử bên dưới.",
    };
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every(isApprovalChainStep)) {
      return {
        steps: [],
        issue: "Snapshot chuỗi cấp duyệt từ API không đúng định dạng.",
      };
    }

    const steps = [...parsed].sort((first, second) => first.step - second.step);
    return {
      steps,
      issue:
        steps.length > 0
          ? null
          : "Snapshot chuỗi cấp duyệt không có cấp nào.",
    };
  } catch {
    return {
      steps: [],
      issue: "Không thể đọc snapshot chuỗi cấp duyệt từ API.",
    };
  }
}

function formatApprovalDate(value: string | null | undefined) {
  if (!value) {
    return "Chưa có dữ liệu";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Thời điểm không hợp lệ";
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getAllowedActions(status: string): ActionType[] {
  if (["CANCELLED", "FILLED", "REJECTED"].includes(status)) return [];
  if (status === "ON_HOLD") return ["completed", "cancelled"];
  if (["APPROVED", "PENDING_APPROVAL", "DRAFT", "CHANGES_REQUESTED"].includes(status)) {
    return ["completed", "paused", "cancelled"];
  }
  return [];
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
  const [requests, setRequests] = useState<RecruitmentRequest[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Tất cả");
  const [modalState, setModalState] = useState<ActionModalState | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [showPipelineWarning, setShowPipelineWarning] = useState(false);
  const [pipelineReviewed, setPipelineReviewed] = useState(false);
  const [pipelineWarningCount, setPipelineWarningCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(
    null,
  );
  const [approvalRequests, setApprovalRequests] = useState<
    ApprovalTrackingRequest[]
  >([]);
  const [isLoadingApprovalRequests, setIsLoadingApprovalRequests] =
    useState(true);
  const [approvalRequestsError, setApprovalRequestsError] = useState("");
  const [selectedApprovalRequest, setSelectedApprovalRequest] =
    useState<ApprovalTrackingRequest | null>(null);
  const [approvalHistory, setApprovalHistory] =
    useState<ApprovalHistoryResponse | null>(null);
  const [isLoadingApprovalHistory, setIsLoadingApprovalHistory] =
    useState(false);
  const [approvalHistoryError, setApprovalHistoryError] = useState("");

  useEffect(() => {
    let isCurrent = true;

    void atsApi<ApprovalTrackingRequest[]>("/api/requisitions")
      .then((data) => {
        if (isCurrent) {
          setApprovalRequests(data);
          setRequests(data.map(toRecruitmentRequest));
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setApprovalRequestsError(fromError(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingApprovalRequests(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedApprovalRequest) {
      return;
    }

    let isCurrent = true;

    void atsApi<ApprovalHistoryResponse>(
      `/api/requisitions/${encodeURIComponent(selectedApprovalRequest.id)}/approval-history`,
    )
      .then((data) => {
        if (isCurrent) {
          setApprovalHistory(data);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setApprovalHistoryError(fromError(error));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingApprovalHistory(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedApprovalRequest]);

  useEffect(() => {
    if (!selectedApprovalRequest) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedApprovalRequest(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedApprovalRequest]);

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
    setPipelineWarningCount(0);
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
    setPipelineWarningCount(0);
  };

  const handleConfirmAction = async () => {
    if (!modalState || isSaving || (role !== "HRManager" && role !== "Admin")) return;

    const cleanedReason = reason.trim();
    if (!cleanedReason) {
      setReasonError("Vui lòng nhập lý do để tiếp tục.");
      return;
    }

    setIsSaving(true);
    setReasonError("");
    try {
      const data = await atsApi<CloseRequisitionResult>(
        `/api/requisitions/${encodeURIComponent(modalState.request.id)}/close`,
        "POST",
        {
          action: closeApiActions[modalState.action],
          reason: note.trim() ? `${cleanedReason}\nGhi chú: ${note.trim()}` : cleanedReason,
          force: pipelineReviewed,
        },
      );

      // Backend chua cap nhat yeu cau khi warning=true. Phai xin xac nhan ro rang.
      if (data.warning) {
        setPipelineWarningCount(data.activeCandidateCount ?? 0);
        setShowPipelineWarning(true);
        setPipelineReviewed(false);
        return;
      }
      if (!data.status || data.id !== modalState.request.id) {
        throw new Error("Phản hồi cập nhật trạng thái không hợp lệ; vui lòng tải lại trang.");
      }

      const id = modalState.request.id;
      setRequests((previous) => previous.map((item) => item.id === id
        ? { ...item, backendStatus: data.status!, status: displayRecruitmentStatus(data.status!) }
        : item));
      setApprovalRequests((previous) => previous.map((item) => item.id === id
        ? { ...item, status: data.status! }
        : item));
      setModalState(null);
      setReason("");
      setNote("");
      setShowPipelineWarning(false);
      setPipelineReviewed(false);
      setPipelineWarningCount(0);
      setToast({
        title: actionSuccessTitle[modalState.action],
        message: `Đã cập nhật trên hệ thống. Số tin công khai đã gỡ: ${data.unpublishedJobCount ?? 0}.`,
      });
    } catch (error: unknown) {
      setReasonError(fromError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    clearLocalSession();
    navigate("/login");
  };

  const openApprovalHistory = (request: ApprovalTrackingRequest) => {
    setApprovalHistory(null);
    setApprovalHistoryError("");
    setIsLoadingApprovalHistory(true);
    setSelectedApprovalRequest(request);
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
              {role === "HRManager" && (
                <button type="button" className="recruitment-action-button"
                  onClick={() => navigate("/recruitment-requests/monitoring")}
                >Danh sách &amp; cảnh báo trễ hạn</button>
              )}
            </div>
          </header>

          <section className="dashboard-panel recruitment-panel approval-tracking-panel">
            <div className="approval-tracking-heading">
              <div>
                <h2>Theo dõi trạng thái &amp; lịch sử phê duyệt</h2>
                <p>
                  Dữ liệu yêu cầu và lịch sử được tải trực tiếp từ hệ thống.
                  Chọn một yêu cầu để xem các bước đã ghi nhận và người đang xử lý.
                </p>
              </div>
            </div>

            {isLoadingApprovalRequests ? (
              <div className="recruitment-empty-state" role="status">
                Đang tải danh sách yêu cầu từ hệ thống...
              </div>
            ) : approvalRequestsError ? (
              <div className="approval-tracking-error" role="alert">
                Không thể tải danh sách yêu cầu: {approvalRequestsError}
              </div>
            ) : approvalRequests.length === 0 ? (
              <div className="recruitment-empty-state">
                API không trả về yêu cầu tuyển dụng nào trong phạm vi tài khoản
                hiện tại.
              </div>
            ) : (
              <div className="recruitment-table-wrap">
                <table className="dashboard-table approval-tracking-table">
                  <thead>
                    <tr>
                      <th>Yêu cầu</th>
                      <th>Phòng ban</th>
                      <th>Trạng thái phê duyệt</th>
                      <th>Lịch sử</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalRequests.map((request) => (
                      <tr key={request.id}>
                        <td>
                          <strong>{request.title || "Yêu cầu tuyển dụng"}</strong>
                          <span className="approval-request-id">{request.id}</span>
                        </td>
                        <td>{request.department?.name || "Chưa có dữ liệu"}</td>
                        <td>
                          <span className="approval-status-badge">
                            {getApprovalStatusLabel(request.status)}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="approval-history-button"
                            onClick={() => openApprovalHistory(request)}
                          >
                            Xem lịch sử
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="dashboard-panel recruitment-panel">
            <p className="recruitment-demo-notice">
              Quản lý trạng thái tuyển dụng từ dữ liệu thực. Khi thao tác, Backend kiểm tra
              ứng viên trong pipeline và đóng các tin đang công khai theo quy tắc hệ thống.
            </p>
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
                    <th>Ngày tạo</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredRequests.map((request) => {
                    const allowedActions = role === "HRManager" || role === "Admin"
                      ? getAllowedActions(request.backendStatus)
                      : [];

                    return (
                      <tr key={request.id}>
                        <td>
                          <strong>{request.code}</strong>
                        </td>
                        <td>{request.title}</td>
                        <td>{request.department}</td>
                        <td>{request.requiredCount}</td>
                        <td>{request.createdAt}</td>
                        <td>
                          <div className="recruitment-status-stack">
                            <span className={getStatusClassName(request.status)}>
                              {getApprovalStatusLabel(request.backendStatus)}
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

            {isLoadingApprovalRequests && (
              <div className="recruitment-empty-state">Đang tải yêu cầu từ Backend...</div>
            )}
            {approvalRequestsError && (
              <div className="approval-tracking-error" role="alert">{approvalRequestsError}</div>
            )}
            {filteredRequests.length === 0 && !isLoadingApprovalRequests && !approvalRequestsError && (
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
                      Backend phát hiện còn <b>{pipelineWarningCount}</b> ứng viên
                      đang xử lý. Không có hồ sơ nào bị xóa. Bạn cần xác nhận
                      rõ ràng trước khi tiếp tục.
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
                    {modalState.request.requiredCount} cần tuyển
                  </span>
                </div>
              </div>

              <div
                className={`recruitment-warning-box ${
                  modalState.action === "cancelled" ? "dangerous" : ""
                } no-pipeline`}
              >
                <strong>Kiểm tra ứng viên</strong>
                <p>Backend sẽ kiểm tra số ứng viên đang xử lý trước khi cập nhật trạng thái.</p>
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
                    Tin tuyển dụng đang công khai sẽ được đóng qua Backend sau khi xác nhận.
                  </p>
                )}
                {modalState.action === "completed" && (
                  <p>
                    Yêu cầu sẽ được cập nhật thành <strong>Đã tuyển đủ</strong> và các tin đăng công khai liên quan sẽ được đóng.
                  </p>
                )}
                {modalState.action === "cancelled" && (
                  <p>
                    Yêu cầu sẽ chuyển sang trạng thái <strong>Đã huỷ</strong>. Các tin công khai liên quan sẽ được đóng; hồ sơ ứng viên không bị xóa.
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

        {selectedApprovalRequest && (
          <div
            className="recruitment-modal-backdrop"
            onClick={() => setSelectedApprovalRequest(null)}
          >
            <section
              className="recruitment-modal approval-history-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="approval-history-title"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="recruitment-modal-close"
                aria-label="Đóng lịch sử phê duyệt"
                onClick={() => setSelectedApprovalRequest(null)}
              >
                ×
              </button>

              <div className="recruitment-modal-header">
                <div>
                  <p className="recruitment-modal-kicker">LỊCH SỬ CHỈ ĐỌC</p>
                  <h3 id="approval-history-title">
                    {approvalHistory?.title || selectedApprovalRequest.title}
                  </h3>
                  <p className="approval-history-id">
                    Mã yêu cầu: {selectedApprovalRequest.id}
                  </p>
                </div>
                {approvalHistory && (
                  <span className="approval-status-badge">
                    {getApprovalStatusLabel(approvalHistory.currentStatus)}
                  </span>
                )}
              </div>

              {isLoadingApprovalHistory ? (
                <div className="recruitment-empty-state" role="status">
                  Đang tải lịch sử phê duyệt...
                </div>
              ) : approvalHistoryError ? (
                <div className="approval-tracking-error" role="alert">
                  Không thể tải lịch sử: {approvalHistoryError}
                </div>
              ) : approvalHistory ? (
                <>
                  <div className="approval-history-readonly-note">
                    Lịch sử này chỉ xem được; giao diện không hỗ trợ chỉnh sửa
                    hoặc xoá.
                  </div>

                  <h4 className="approval-history-section-title">
                    Chuỗi cấp duyệt
                  </h4>
                  {(() => {
                    const chain = parseApprovalChain(
                      approvalHistory.approvalChain,
                    );

                    if (chain.steps.length === 0) {
                      return (
                        <>
                          <div
                            className={approvalHistory.approvalChain
                              ? "approval-tracking-error"
                              : "approval-history-readonly-note"}
                            role="status"
                          >
                            {chain.issue}
                          </div>
                          {approvalHistory.currentStatus === "PENDING_APPROVAL" &&
                            approvalHistory.currentPendingApprover && (
                              <section className="approval-current-step">
                                <span className="approval-timeline-marker is-pending" />
                                <div>
                                  <span className="approval-step-state">
                                    Đang chờ xử lý
                                  </span>
                                  <h4>
                                    {approvalHistory.currentPendingApprover.fullName}
                                  </h4>
                                  {approvalHistory.currentPendingApprover.email && (
                                    <p>
                                      {approvalHistory.currentPendingApprover.email}
                                    </p>
                                  )}
                                </div>
                              </section>
                            )}
                        </>
                      );
                    }

                    return (
                      <>
                        <ol className="approval-chain-list">
                          {chain.steps.map((step) => {
                            const stepHistory = approvalHistory.history.filter(
                              (entry) => entry.step === step.step,
                            );
                            const latestHistoryEntry =
                              stepHistory[stepHistory.length - 1];
                            const currentApprover =
                              approvalHistory.currentPendingApprover?.id ===
                              step.approverId
                                ? approvalHistory.currentPendingApprover
                                : null;
                            const approverName =
                              latestHistoryEntry?.actor?.fullName ||
                              currentApprover?.fullName;
                            const statusClass =
                              step.status === "APPROVED"
                                ? "is-approved"
                                : step.status === "REJECTED"
                                  ? "is-rejected"
                                  : step.status === "PENDING"
                                    ? "is-pending"
                                    : "is-neutral";

                            return (
                              <li className="approval-chain-step" key={step.step}>
                                <span
                                  className={`approval-timeline-marker ${statusClass}`}
                                />
                                <div className="approval-history-entry-content">
                                  <div className="approval-history-entry-heading">
                                    <strong>Cấp {step.step}</strong>
                                    <span
                                      className={`approval-step-state ${statusClass}`}
                                    >
                                      {getApprovalChainStatusLabel(step.status)}
                                    </span>
                                  </div>
                                  <p className="approval-history-actor">
                                    Người duyệt:{" "}
                                    {approverName ||
                                      `ID ${step.approverId} (API chưa cung cấp tên)`}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                        {approvalHistory.currentStatus === "PENDING_APPROVAL" &&
                          !approvalHistory.currentPendingApprover && (
                            <div className="approval-tracking-error" role="status">
                              API chưa xác định người đang xử lý yêu cầu này.
                            </div>
                          )}
                      </>
                    );
                  })()}

                  <h4 className="approval-history-section-title">
                    Các bước đã được ghi nhận
                  </h4>
                  {approvalHistory.history.length === 0 ? (
                    <div className="recruitment-empty-state">
                      Chưa có bước phê duyệt nào được ghi nhận trong lịch sử.
                    </div>
                  ) : (
                    <ol className="approval-history-timeline">
                      {[...approvalHistory.history]
                        .sort(
                          (first, second) =>
                            first.step - second.step ||
                            new Date(first.processedAt).getTime() -
                              new Date(second.processedAt).getTime(),
                        )
                        .map((entry) => (
                          <li className="approval-history-entry" key={entry.id}>
                            <span
                              className={`approval-timeline-marker ${
                                entry.decision === "APPROVE"
                                  ? "is-approved"
                                  : entry.decision === "REJECT"
                                    ? "is-rejected"
                                    : "is-neutral"
                              }`}
                            />
                            <div className="approval-history-entry-content">
                              <div className="approval-history-entry-heading">
                                <strong>Cấp {entry.step}</strong>
                                <span
                                  className={`approval-step-state ${
                                    entry.decision === "APPROVE"
                                      ? "is-approved"
                                      : entry.decision === "REJECT"
                                        ? "is-rejected"
                                        : ""
                                  }`}
                                >
                                  {getApprovalDecisionLabel(entry.decision)}
                                </span>
                              </div>
                              <p className="approval-history-actor">
                                Người xử lý: {entry.actor?.fullName || "Chưa có dữ liệu"}
                                {entry.actor?.email ? ` · ${entry.actor.email}` : ""}
                              </p>
                              <p className="approval-history-datetime">
                                Thời điểm: {formatApprovalDate(entry.processedAt)}
                              </p>
                              <p className="approval-history-status-change">
                                {getApprovalStatusLabel(entry.fromStatus)} →{" "}
                                {getApprovalStatusLabel(entry.toStatus)}
                              </p>
                              <p className="approval-history-notes">
                                <strong>
                                  {entry.decision === "REJECT"
                                    ? "Lý do từ chối:"
                                    : "Ý kiến:"}
                                </strong>{" "}
                                {entry.notes || "Không có ý kiến được ghi nhận."}
                              </p>
                            </div>
                          </li>
                        ))}
                    </ol>
                  )}

                  <p className="approval-history-data-limit">
                    Khi có snapshot, trạng thái từng cấp lấy từ API lịch sử.
                    Nếu không có snapshot, chỉ hiển thị các quyết định đã ghi
                    nhận và người đang xử lý, không suy đoán chuỗi duyệt cũ.
                  </p>
                </>
              ) : null}
            </section>
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
