import { useEffect, useMemo, useState } from "react";
import {
  Search,
  UserRoundCheck,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
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
  department?: { id?: string; name?: string } | null;
};

type RecruiterSummary = { id: string; fullName: string; email?: string };
type SupportingRecruiter = {
  recruiterId: string;
  recruiter?: RecruiterSummary | null;
};

type AssignmentRequisition = Requisition & {
  leadRecruiterId?: string | null;
  leadRecruiter?: RecruiterSummary | null;
  supportingRecruiters?: SupportingRecruiter[];
};

type AssignmentHistoryEntry = {
  id: string;
  action: string;
  createdAt: string;
  notes?: string | null;
  actor?: RecruiterSummary | null;
  previousLeadRecruiter?: RecruiterSummary | null;
  newLeadRecruiter?: RecruiterSummary | null;
  supportingRecruiters?: RecruiterSummary[];
};

type AssignmentDraft = {
  primaryRecruiterId: string;
  supportRecruiterIds: string[];
  notes: string;
};

const emptyDraft: AssignmentDraft = {
  primaryRecruiterId: "",
  supportRecruiterIds: [],
  notes: "",
};

function draftFromRequisition(item: AssignmentRequisition): AssignmentDraft {
  return {
    primaryRecruiterId: item.leadRecruiterId ?? item.leadRecruiter?.id ?? "",
    supportRecruiterIds: (item.supportingRecruiters ?? []).map(
      (assignment) => assignment.recruiterId,
    ),
    notes: "",
  };
}

function historyActionLabel(action: string): string {
  switch (action) {
    case "ASSIGN":
      return "Phân công lần đầu";
    case "HANDOVER":
      return "Chuyển giao recruiter chính";
    case "UPDATE_SUPPORTING":
      return "Cập nhật recruiter hỗ trợ";
    case "REASSIGN":
      return "Phân công lại";
    default:
      return action;
  }
}

function RecruitmentAssignment() {
  const [requisitions, setRequisitions] = useState<AssignmentRequisition[]>([]);
  const [recruiters, setRecruiters] = useState<RecruiterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedRequisitionId, setSelectedRequisitionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssignmentDraft>(emptyDraft);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [history, setHistory] = useState<AssignmentHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const timeoutId = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError("");
        const [requisitionData, userData] = await Promise.all([
          atsApi<AssignmentRequisition[]>("/api/requisitions"),
          atsApi<RecruiterUser[]>("/api/users"),
        ]);
        if (cancelled) return;
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không thể tải dữ liệu phân công tuyển dụng.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadData();
    return () => { cancelled = true; };
  }, []);

  // Lấy dữ liệu mới nhất mỗi lần mở modal. Dữ liệu danh sách có thể đã thay đổi
  // do quản lý khác phân công cùng một yêu cầu tuyển dụng.
  useEffect(() => {
    if (!selectedRequisitionId) return;
    let cancelled = false;
    const id = selectedRequisitionId;
    void atsApi<AssignmentRequisition>(`/api/requisitions/${encodeURIComponent(id)}`)
      .then((item) => {
        if (cancelled) return;
        setRequisitions((current) => current.map((old) => old.id === id ? item : old));
        setDraft(draftFromRequisition(item));
      })
      .catch((err: unknown) => {
        if (!cancelled) setDetailsError(err instanceof Error ? err.message : "Không tải được phân công hiện tại.");
      })
      .finally(() => { if (!cancelled) setDetailsLoading(false); });

    void atsApi<AssignmentHistoryEntry[]>(`/api/requisitions/${encodeURIComponent(id)}/assignment-history`)
      .then((items) => { if (!cancelled) setHistory(items); })
      .catch((err: unknown) => {
        if (!cancelled) setHistoryError(err instanceof Error ? err.message : "Không tải được lịch sử chuyển giao.");
      })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });

    return () => { cancelled = true; };
  }, [selectedRequisitionId]);

  const filteredRequisitions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return requisitions;
    return requisitions.filter((item) => {
      const departmentName = item.department?.name ?? "";
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.id.toLowerCase().includes(keyword) ||
        departmentName.toLowerCase().includes(keyword)
      );
    });
  }, [requisitions, search]);

  const selectedRequisition = requisitions.find((item) => item.id === selectedRequisitionId) ?? null;
  const primaryRecruiter = recruiters.find((user) => user.id === draft.primaryRecruiterId);

  const openAssignment = (requisition: AssignmentRequisition) => {
    setDraft(draftFromRequisition(requisition));
    setSaveMessage("");
    setToast("");
    // Khởi tạo trạng thái modal tại sự kiện mở, không setState đồng bộ trong effect.
    setDetailsLoading(true);
    setDetailsError("");
    setHistoryLoading(true);
    setHistoryError("");
    setHistory([]);
    setSelectedRequisitionId(requisition.id);
  };

  const closeAssignment = () => {
    if (saving) return;
    setSelectedRequisitionId(null);
    setSaveMessage("");
  };

  const toggleSupportRecruiter = (recruiterId: string) => {
    if (recruiterId === draft.primaryRecruiterId) return;
    setDraft((current) => {
      const exists = current.supportRecruiterIds.includes(recruiterId);
      return {
        ...current,
        supportRecruiterIds: exists
          ? current.supportRecruiterIds.filter((id) => id !== recruiterId)
          : [...current.supportRecruiterIds, recruiterId],
      };
    });
    setSaveMessage("");
  };

  const handlePrimaryRecruiterChange = (recruiterId: string) => {
    setDraft((current) => ({
      ...current,
      primaryRecruiterId: recruiterId,
      supportRecruiterIds: current.supportRecruiterIds.filter((id) => id !== recruiterId),
    }));
    setSaveMessage("");
  };

  const handleSave = async () => {
    if (!selectedRequisitionId || saving || detailsLoading || detailsError) return;
    if (!draft.primaryRecruiterId) {
      setSaveMessage("Vui lòng chọn recruiter chính.");
      return;
    }
    if (draft.supportRecruiterIds.includes(draft.primaryRecruiterId)) {
      setSaveMessage("Recruiter chính không thể đồng thời là recruiter hỗ trợ.");
      return;
    }

    const id = selectedRequisitionId;
    setSaving(true);
    setSaveMessage("");
    try {
      const updated = await atsApi<AssignmentRequisition>(
        `/api/requisitions/${encodeURIComponent(id)}/assign`,
        "PUT",
        {
          leadRecruiterId: draft.primaryRecruiterId,
          supportingRecruiterIds: [...new Set(draft.supportRecruiterIds)],
          ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        },
      );
      setRequisitions((current) => current.map((item) => item.id === id ? updated : item));
      // Đóng modal ngay sau khi API xác nhận lưu thành công.
      // Lịch sử được tải lại khi người dùng mở biểu mẫu lần kế tiếp.
      setSelectedRequisitionId(null);
      setDraft(emptyDraft);
      setSaveMessage("");
      setToast("Đã lưu phân công thành công.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Không lưu được phân công. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
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
      {toast && (
        <div className="s306-toast" role="status" aria-live="polite">
          <CheckCircle2 size={20} aria-hidden="true" />
          <span>{toast}</span>
          <button type="button" onClick={() => setToast("")} aria-label="Đóng thông báo">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      <header className="s306-header">
        <div>
          <h1>Phân công tuyển dụng</h1>
          <p>Phân công recruiter chính và recruiter hỗ trợ cho từng yêu cầu tuyển dụng.</p>
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
        <div className="s306-alert s306-alert-error" role="alert">
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
        <span className="s306-count">{filteredRequisitions.length} yêu cầu</span>
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
                <td><span className="s306-status">{item.status}</span></td>
                <td>
                  {item.leadRecruiter ? (
                    <div className="s306-assignment-display">
                      <strong>{item.leadRecruiter.fullName}</strong>
                      <span>{item.supportingRecruiters?.length ?? 0} recruiter hỗ trợ</span>
                    </div>
                  ) : item.leadRecruiterId ? (
                    <span className="s306-assigned">Đã phân công</span>
                  ) : (
                    <span className="s306-unassigned">Chưa phân công</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="s306-assign-button"
                    onClick={() => openAssignment(item)}
                  >
                    <UserRoundCheck size={17} />
                    {item.leadRecruiterId ? "Điều chỉnh" : "Phân công"}
                  </button>
                </td>
              </tr>
            ))}
            {filteredRequisitions.length === 0 && (
              <tr><td colSpan={6}><div className="s306-empty">Không tìm thấy yêu cầu tuyển dụng phù hợp.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedRequisition && (
        <div className="s306-modal-backdrop">
          <div className="s306-modal" role="dialog" aria-modal="true" aria-labelledby="s306-modal-title">
            <div className="s306-modal-header">
              <div>
                <p className="s306-eyebrow">Phân công recruiter</p>
                <h2 id="s306-modal-title">{selectedRequisition.title}</h2>
                <span>{selectedRequisition.department?.name || "Chưa xác định phòng ban"}</span>
              </div>
              <button type="button" className="s306-icon-button" onClick={closeAssignment} disabled={saving} aria-label="Đóng">
                <X size={20} />
              </button>
            </div>

            {detailsLoading && <div className="s306-inline-state">Đang cập nhật phân công mới nhất...</div>}
            {detailsError && (
              <div className="s306-alert s306-alert-error" role="alert"><AlertCircle size={18} /><span>{detailsError}</span></div>
            )}

            <fieldset className="s306-fields" disabled={saving || detailsLoading || Boolean(detailsError)}>
              <div className="s306-form-section">
                <label htmlFor="primaryRecruiter">Recruiter chính <span>*</span></label>
                <select
                  id="primaryRecruiter"
                  value={draft.primaryRecruiterId}
                  onChange={(event) => handlePrimaryRecruiterChange(event.target.value)}
                >
                  <option value="">-- Chọn recruiter chính --</option>
                  {recruiters.map((user) => (
                    <option key={user.id} value={user.id}>{user.fullName} - {user.email}</option>
                  ))}
                </select>
                {primaryRecruiter && (
                  <div className="s306-primary-preview">
                    <UserRoundCheck size={18} />
                    <div><strong>{primaryRecruiter.fullName}</strong><span>{primaryRecruiter.email}</span></div>
                  </div>
                )}
              </div>
              <div className="s306-form-section">
                <div className="s306-section-title">
                  <div><label>Recruiter hỗ trợ</label><p>Có thể chọn nhiều người.</p></div>
                  <span>{draft.supportRecruiterIds.length} đã chọn</span>
                </div>
                <div className="s306-recruiter-list">
                  {recruiters
                    .filter((user) => user.id !== draft.primaryRecruiterId)
                    .map((user) => (
                      <label className="s306-recruiter-option" key={user.id}>
                        <input
                          type="checkbox"
                          checked={draft.supportRecruiterIds.includes(user.id)}
                          onChange={() => toggleSupportRecruiter(user.id)}
                        />
                        <div><strong>{user.fullName}</strong><span>{user.email}</span></div>
                      </label>
                    ))}
                </div>
              </div>
              <div className="s306-form-section">
                <label htmlFor="s306-notes">Ghi chú phân công (không bắt buộc)</label>
                <textarea
                  id="s306-notes"
                  className="s306-notes"
                  rows={2}
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Lý do chuyển giao hoặc cập nhật phân công..."
                />
              </div>
            </fieldset>

            <div className="s306-history">
              <div className="s306-history-title"><History size={18} /><strong>Lịch sử chuyển giao</strong></div>
              {historyLoading ? (
                <p>Đang tải lịch sử...</p>
              ) : historyError ? (
                <p className="s306-history-error" role="alert">{historyError}</p>
              ) : history.length === 0 ? (
                <p>Chưa có lịch sử phân công.</p>
              ) : (
                <ol className="s306-history-list">
                  {history.map((entry) => (
                    <li key={entry.id}>
                      <div className="s306-history-row">
                        <strong>{historyActionLabel(entry.action)}</strong>
                        <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("vi-VN")}</time>
                      </div>
                      <p>Thực hiện: {entry.actor?.fullName ?? "Không xác định"}</p>
                      <p>
                        {entry.previousLeadRecruiter?.fullName ?? "Chưa phân công"} → {entry.newLeadRecruiter?.fullName ?? "Chưa phân công"}
                      </p>
                      <p>Hỗ trợ: {entry.supportingRecruiters?.map((user) => user.fullName).join(", ") || "Không có"}</p>
                      {entry.notes && <p>Ghi chú: {entry.notes}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {saveMessage && (
              <div className="s306-alert s306-alert-error" role="alert">
                <AlertCircle size={18} /><span>{saveMessage}</span>
              </div>
            )}
            <div className="s306-modal-footer">
              <button type="button" className="s306-secondary-button" onClick={closeAssignment} disabled={saving}>
                Hủy
              </button>
              <button
                type="button"
                className="s306-primary-button"
                onClick={() => void handleSave()}
                disabled={saving || detailsLoading || Boolean(detailsError)}
              >
                {saving ? "Đang lưu..." : "Lưu phân công"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default RecruitmentAssignment;
