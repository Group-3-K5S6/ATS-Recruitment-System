import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Loader2,
  MessageSquareMore,
  Search,
  XCircle,
} from "lucide-react";

import { atsApi, fromError } from "./api";
import type { Requisition } from "./api";

import "./requisition-approval.css";

type RequisitionDetail = Requisition & {
  approverId?: string | null;

  hiringManager?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;

  approver?: {
    id: string;
    fullName: string;
    email?: string;
  } | null;
};

type Decision = "APPROVE" | "REJECT";

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    DRAFT: "Nháp",
    PENDING_APPROVAL: "Chờ phê duyệt",
    APPROVED: "Đã duyệt",
    REJECTED: "Từ chối",
  };

  return labels[status] || status;
}

function formatSalary(value: number | null | undefined) {
  if (value == null) {
    return "Chưa xác định";
  }

  return `${new Intl.NumberFormat("vi-VN").format(value)} VNĐ`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Chưa xác định";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Chưa xác định";
  }

  return date.toLocaleDateString("vi-VN");
}

export default function RequisitionApproval() {
  const [items, setItems] = useState<Requisition[]>([]);

  const [selected, setSelected] = useState<RequisitionDetail | null>(null);

  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);

  const [loadingDetail, setLoadingDetail] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [notes, setNotes] = useState("");

  const [error, setError] = useState("");

  const [message, setMessage] = useState("");

  async function loadItems() {
    setLoading(true);
    setError("");

    try {
      const data = await atsApi<Requisition[]>("/api/requisitions");

      setItems(data);
    } catch (requestError) {
      setError(fromError(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadItems(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const pendingItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return items
      .filter((item) => item.status === "PENDING_APPROVAL")
      .filter((item) => {
        if (!keyword) {
          return true;
        }

        const title = item.title?.toLowerCase() || "";

        const department = item.department?.name?.toLowerCase() || "";

        const id = item.id.toLowerCase();

        return (
          title.includes(keyword) ||
          department.includes(keyword) ||
          id.includes(keyword)
        );
      });
  }, [items, search]);

  async function openDetail(item: Requisition) {
    if (loadingDetail) {
      return;
    }

    setLoadingDetail(true);
    setError("");
    setMessage("");
    setNotes("");

    try {
      const detail = await atsApi<RequisitionDetail>(
        `/api/requisitions/${encodeURIComponent(item.id)}`,
      );

      setSelected(detail);
    } catch (requestError) {
      setError(fromError(requestError));
    } finally {
      setLoadingDetail(false);
    }
  }

  function closeDetail() {
    if (submitting) {
      return;
    }

    setSelected(null);
    setNotes("");
    setError("");
    setMessage("");
  }

  async function submitDecision(decision: Decision) {
    if (!selected || submitting) {
      return;
    }

    if (decision === "REJECT" && !notes.trim()) {
      setError("Vui lòng nhập ý kiến trước khi từ chối yêu cầu.");

      return;
    }

    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await atsApi(
        `/api/requisitions/${encodeURIComponent(selected.id)}/approve`,
        "POST",
        {
          decision,
          notes: notes.trim() || undefined,
        },
      );

      if (decision === "APPROVE") {
        setMessage("Đã duyệt yêu cầu tuyển dụng.");
      } else {
        setMessage("Đã từ chối yêu cầu tuyển dụng.");
      }

      await loadItems();

      window.setTimeout(() => {
        setSelected(null);
        setNotes("");
        setMessage("");
      }, 700);
    } catch (requestError) {
      setError(fromError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function requestSupplement() {
    setError("");
    setMessage("");

    if (!notes.trim()) {
      setError(
        "Vui lòng nhập nội dung cần bổ sung trước khi gửi yêu cầu bổ sung.",
      );

      return;
    }

    /*
     * S3-02:
     * Backend hiện tại chưa có decision REQUEST_CHANGES /
     * REQUEST_SUPPLEMENT.
     *
     * Không giả lập thành công ở FE.
     */
    setError(
      "Backend hiện chưa hỗ trợ hành động Yêu cầu bổ sung. Cần bổ sung API trước khi chức năng này có thể gửi thật.",
    );
  }

  return (
    <div className="s302-page">
      {/* =========================
          HEADER
      ========================= */}

      <header className="s302-header">
        <div className="s302-header-copy">
          <p className="s302-eyebrow">PHÊ DUYỆT TUYỂN DỤNG</p>

          <h1>Yêu cầu chờ phê duyệt</h1>

          <p className="s302-subtitle">
            Xem chi tiết và đưa ra quyết định đối với các yêu cầu tuyển dụng
            được phân công cho bạn.
          </p>
        </div>

        <div className="s302-summary">
          <div className="s302-summary-icon">
            <Clock3 size={22} />
          </div>

          <div>
            <strong>{pendingItems.length}</strong>

            <span>Yêu cầu đang chờ</span>
          </div>
        </div>
      </header>

      {/* =========================
          ERROR DANH SÁCH
      ========================= */}

      {error && !selected && (
        <div
          className="
            s302-alert
            s302-alert--error
          "
        >
          {error}
        </div>
      )}

      {/* =========================
          DANH SÁCH
      ========================= */}

      <section className="s302-card">
        <div className="s302-card-header">
          <div>
            <h2>Danh sách yêu cầu</h2>

            <p>Các yêu cầu tuyển dụng đang chờ bạn xử lý.</p>
          </div>
        </div>

        {/* SEARCH */}

        <div className="s302-toolbar">
          <div className="s302-search">
            <Search size={19} />

            <input
              type="text"
              value={search}
              placeholder="Tìm theo vị trí, phòng ban hoặc mã yêu cầu..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {/* LOADING */}

        {loading ? (
          <div className="s302-state">
            <Loader2 className="s302-spin" size={34} />

            <strong>Đang tải dữ liệu</strong>

            <span>Vui lòng chờ trong giây lát...</span>
          </div>
        ) : pendingItems.length === 0 ? (
          /* EMPTY */

          <div className="s302-state">
            <div className="s302-empty-icon">
              <CheckCircle2 size={34} />
            </div>

            <strong>Không có yêu cầu nào đang chờ phê duyệt</strong>

            <span>Các yêu cầu mới được phân công sẽ xuất hiện tại đây.</span>
          </div>
        ) : (
          /* TABLE */

          <div className="s302-table-wrapper">
            <table className="s302-table">
              <thead>
                <tr>
                  <th>Yêu cầu</th>

                  <th>Phòng ban</th>

                  <th>Số lượng</th>

                  <th>Dải lương</th>

                  <th>Trạng thái</th>

                  <th>Thao tác</th>
                </tr>
              </thead>

              <tbody>
                {pendingItems.map((item) => (
                  <tr key={item.id}>
                    {/* TITLE */}

                    <td>
                      <div className="s302-title-cell">
                        <div className="s302-file-icon">
                          <FileText size={18} />
                        </div>

                        <div>
                          <strong>{item.title || "Yêu cầu tuyển dụng"}</strong>

                          <span>{item.id}</span>
                        </div>
                      </div>
                    </td>

                    {/* DEPARTMENT */}

                    <td>{item.department?.name || "Chưa xác định"}</td>

                    {/* HEADCOUNT */}

                    <td>{item.headcount || 1}</td>

                    {/* SALARY */}

                    <td>
                      <div className="s302-salary">
                        <span>{formatSalary(item.proposedSalaryMin)}</span>

                        <span className="s302-salary-separator">–</span>

                        <span>{formatSalary(item.proposedSalaryMax)}</span>
                      </div>
                    </td>

                    {/* STATUS */}

                    <td>
                      <span className="s302-status">
                        <Clock3 size={14} />

                        {statusLabel(item.status)}
                      </span>
                    </td>

                    {/* ACTION */}

                    <td>
                      <button
                        type="button"
                        className="s302-view-button"
                        onClick={() => void openDetail(item)}
                        disabled={loadingDetail}
                      >
                        <Eye size={16} />
                        Xem chi tiết
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =========================
          MODAL CHI TIẾT
      ========================= */}

      {selected && (
        <div className="s302-overlay" onMouseDown={closeDetail}>
          <div
            className="s302-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            {/* HEADER MODAL */}

            <div className="s302-modal-header">
              <div>
                <p className="s302-eyebrow">CHI TIẾT YÊU CẦU</p>

                <h2>{selected.title || "Yêu cầu tuyển dụng"}</h2>

                <span className="s302-request-id">
                  Mã yêu cầu: {selected.id}
                </span>
              </div>

              <button
                type="button"
                className="s302-close"
                onClick={closeDetail}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            {/* BODY MODAL */}

            <div className="s302-modal-body">
              {/* BASIC INFO */}

              <section className="s302-detail-grid">
                <div>
                  <span>Phòng ban</span>

                  <strong>
                    {selected.department?.name || "Chưa xác định"}
                  </strong>
                </div>

                <div>
                  <span>Số lượng cần tuyển</span>

                  <strong>{selected.headcount || 1}</strong>
                </div>

                <div>
                  <span>Lương tối thiểu</span>

                  <strong>{formatSalary(selected.proposedSalaryMin)}</strong>
                </div>

                <div>
                  <span>Lương tối đa</span>

                  <strong>{formatSalary(selected.proposedSalaryMax)}</strong>
                </div>

                <div>
                  <span>Ngày cần nhân sự</span>

                  <strong>{formatDate(selected.targetDate)}</strong>
                </div>

                <div>
                  <span>Trạng thái</span>

                  <strong className="s302-detail-status">
                    {statusLabel(selected.status)}
                  </strong>
                </div>
              </section>

              {/* MANAGER */}

              {(selected.hiringManager || selected.approver) && (
                <section className="s302-people">
                  {selected.hiringManager && (
                    <div>
                      <span>Người tạo / Trưởng bộ phận</span>

                      <strong>{selected.hiringManager.fullName}</strong>
                    </div>
                  )}

                  {selected.approver && (
                    <div>
                      <span>Người duyệt</span>

                      <strong>{selected.approver.fullName}</strong>
                    </div>
                  )}
                </section>
              )}

              {/* DESCRIPTION */}

              <section className="s302-description">
                <h3>Mô tả yêu cầu</h3>

                <p>{selected.description || "Chưa có mô tả."}</p>
              </section>

              {/* REQUIREMENTS */}

              <section className="s302-description">
                <h3>Yêu cầu ứng viên</h3>

                <p>{selected.requirements || "Chưa có yêu cầu chi tiết."}</p>
              </section>

              {/* SALARY EXPLANATION */}

              {selected.salaryExplanation && (
                <section className="s302-description">
                  <h3>Giải trình mức lương</h3>

                  <p>{selected.salaryExplanation}</p>
                </section>
              )}

              {/* NOTES */}

              <section className="s302-comment">
                <label htmlFor="approval-notes">
                  <MessageSquareMore size={18} />Ý kiến người duyệt
                </label>

                <textarea
                  id="approval-notes"
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);

                    setError("");
                  }}
                  placeholder="Nhập ý kiến khi từ chối hoặc yêu cầu bổ sung..."
                  rows={4}
                />

                <small>
                  Từ chối và yêu cầu bổ sung bắt buộc phải nhập ý kiến.
                </small>
              </section>

              {/* ERROR */}

              {error && (
                <div
                  className="
                    s302-alert
                    s302-alert--error
                  "
                >
                  {error}
                </div>
              )}

              {/* SUCCESS */}

              {message && (
                <div
                  className="
                    s302-alert
                    s302-alert--success
                  "
                >
                  {message}
                </div>
              )}
            </div>

            {/* FOOTER */}

            <div className="s302-modal-footer">
              <button
                type="button"
                className="
                  s302-btn
                  s302-btn--supplement
                "
                onClick={requestSupplement}
                disabled={submitting}
              >
                <MessageSquareMore size={17} />
                Yêu cầu bổ sung
              </button>

              <button
                type="button"
                className="
                  s302-btn
                  s302-btn--reject
                "
                onClick={() => void submitDecision("REJECT")}
                disabled={submitting}
              >
                <XCircle size={17} />
                Từ chối
              </button>

              <button
                type="button"
                className="
                  s302-btn
                  s302-btn--approve
                "
                onClick={() => void submitDecision("APPROVE")}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="s302-spin" size={17} />
                ) : (
                  <CheckCircle2 size={17} />
                )}
                Duyệt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
