import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { atsApi, fromError } from "./api";
import "./requisition-deadline-monitor.css";

type Person = { id: string; fullName: string };
type SupportingAssignment = {
  recruiterId?: string;
  recruiter?: Person | null;
};
type MonitoringRequisition = {
  id: string;
  title: string;
  status: string;
  departmentId: string;
  department?: { id: string; name: string } | null;
  createdAt: string;
  targetDate?: string | null;
  daysOpen: number;
  daysRemaining: number | null;
  isOverdue: boolean;
  leadRecruiterId?: string | null;
  leadRecruiter?: Person | null;
  supportingRecruiters?: SupportingAssignment[];
  recruiters?: Person[];
};

type Filters = {
  status: string;
  departmentId: string;
  recruiterId: string;
  fromDate: string;
  toDate: string;
};
const initialFilters: Filters = {
  status: "", departmentId: "", recruiterId: "", fromDate: "", toDate: "",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Bản nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CHANGES_REQUESTED: "Yêu cầu bổ sung",
  CANCELLED: "Đã huỷ",
  PAUSED: "Tạm dừng",
  CLOSED: "Đã đóng",
  COMPLETED: "Đã tuyển đủ",
};
const toDayKey = (value: string) => value.slice(0, 10);
const formatDay = (value?: string | null) => {
  if (!value) return "Chưa xác định";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không hợp lệ" : date.toLocaleDateString("vi-VN");
};
const getRecruiterIds = (item: MonitoringRequisition): string[] => [
  item.leadRecruiterId,
  item.leadRecruiter?.id,
  ...(item.supportingRecruiters ?? []).flatMap((entry) => [entry.recruiterId, entry.recruiter?.id]),
  ...(item.recruiters ?? []).map((recruiter) => recruiter.id),
].filter((value): value is string => Boolean(value));
const getRecruiterNames = (item: MonitoringRequisition): string => {
  const people = [
    item.leadRecruiter,
    ...(item.supportingRecruiters ?? []).map((entry) => entry.recruiter),
    ...(item.recruiters ?? []),
  ].filter((person): person is Person => Boolean(person?.id));
  const unique = [...new Map(people.map((person) => [person.id, person.fullName])).values()];
  return unique.length ? unique.join(", ") : "Chưa phân công";
};
function remainingLabel(value: number | null): string {
  if (value === null) return "Chưa có ngày cần người";
  if (value < 0) return `Trễ ${Math.abs(value)} ngày`;
  if (value === 0) return "Đến hạn hôm nay";
  return `Còn ${value} ngày`;
}

export default function RequisitionDeadlineMonitor() {
  const navigate = useNavigate();
  const [items, setItems] = useState<MonitoringRequisition[]>([]);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void atsApi<MonitoringRequisition[]>("/api/requisitions")
      .then((result) => { if (active) setItems(result); })
      .catch((cause: unknown) => { if (active) setError(fromError(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const statuses = useMemo(() => [...new Set(items.map((item) => item.status))].sort(), [items]);
  const departments = useMemo(() => {
    const mapped = new Map<string, string>();
    items.forEach((item) => mapped.set(item.departmentId, item.department?.name || item.departmentId));
    return [...mapped].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [items]);
  const recruiters = useMemo(() => {
    const mapped = new Map<string, string>();
    items.forEach((item) => {
      if (item.leadRecruiter) mapped.set(item.leadRecruiter.id, item.leadRecruiter.fullName);
      (item.supportingRecruiters ?? []).forEach((entry) => {
        if (entry.recruiter) mapped.set(entry.recruiter.id, entry.recruiter.fullName);
      });
      (item.recruiters ?? []).forEach((person) => mapped.set(person.id, person.fullName));
    });
    return [...mapped].sort((a, b) => a[1].localeCompare(b[1], "vi"));
  }, [items]);
  const datesValid = !filters.fromDate || !filters.toDate || filters.fromDate <= filters.toDate;
  const visibleItems = useMemo(() => {
    if (!datesValid) return [];
    return items.filter((item) => {
      const created = toDayKey(item.createdAt);
      return (!filters.status || filters.status === item.status)
        && (!filters.departmentId || filters.departmentId === item.departmentId)
        && (!filters.recruiterId || getRecruiterIds(item).includes(filters.recruiterId))
        && (!filters.fromDate || created >= filters.fromDate)
        && (!filters.toDate || created <= filters.toDate);
    });
  }, [items, filters, datesValid]);
  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
  };
  const reload = () => {
    setLoading(true);
    setError("");
    setRefreshKey((value) => value + 1);
  };

  return (
    <section className="s308-page" aria-labelledby="s308-title">
      <header className="s308-header">
        <div>

          <h1 id="s308-title">Danh sách & cảnh báo trễ hạn</h1>
          <p>Theo dõi ngày mở, ngày cần người và những yêu cầu đã quá hạn.</p>
        </div>
        <div className="s308-header-actions">
          <button
            type="button"
            className="s308-btn s308-back"
            onClick={() => navigate("/recruitment-requests")}
          >
            ← Quay về Yêu cầu tuyển dụng
          </button>
          <button
            type="button"
            className="s308-btn"
            onClick={reload}
            disabled={loading}
          >
            Làm mới
          </button>
        </div>
      </header>
      <div className="s308-panel">
        <div className="s308-filters" aria-label="Bộ lọc yêu cầu tuyển dụng">
          <label>Trạng thái
            <select value={filters.status} onChange={(event) => setFilter("status", event.target.value)}>
              <option value="">Tất cả</option>
              {statuses.map((status) => <option key={status} value={status}>{statusLabels[status] || status}</option>)}
            </select>
          </label>
          <label>Phòng ban
            <select value={filters.departmentId} onChange={(event) => setFilter("departmentId", event.target.value)}>
              <option value="">Tất cả</option>
              {departments.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>Recruiter phụ trách
            <select value={filters.recruiterId} onChange={(event) => setFilter("recruiterId", event.target.value)}>
              <option value="">Tất cả</option>
              {recruiters.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>Ngày tạo từ
            <input type="date" value={filters.fromDate} max={filters.toDate || undefined} onChange={(event) => setFilter("fromDate", event.target.value)} />
          </label>
          <label>Đến ngày
            <input type="date" value={filters.toDate} min={filters.fromDate || undefined} onChange={(event) => setFilter("toDate", event.target.value)} />
          </label>
          <button className="s308-btn s308-clear" type="button" onClick={() => setFilters(initialFilters)}>Xóa lọc</button>
        </div>
        {!datesValid && <p className="s308-error" role="alert">Ngày bắt đầu không được sau ngày kết thúc.</p>}
        <div className="s308-count" aria-live="polite">
          {loading ? "Đang tải dữ liệu…" : `${visibleItems.length} yêu cầu${visibleItems.length ? ` · ${visibleItems.filter((item) => item.isOverdue).length} quá hạn` : ""}`}
        </div>
        {error ? <p className="s308-error" role="alert">Không tải được dữ liệu: {error}</p> : null}
        {!error && !loading && datesValid && (
          <div className="s308-table-scroll">
            <table className="s308-table">
              <thead><tr>
                <th>Yêu cầu tuyển dụng</th><th>Phòng ban</th><th>Trạng thái</th>
                <th>Recruiter phụ trách</th><th>Ngày mở</th><th>Ngày cần người</th>
                <th>Số ngày mở</th><th>Thời gian còn lại</th>
              </tr></thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.id} className={item.isOverdue ? "s308-overdue" : ""}>
                    <td><strong>{item.title}</strong><small>{item.id}</small></td>
                    <td>{item.department?.name || "Chưa xác định"}</td>
                    <td>{statusLabels[item.status] || item.status}</td>
                    <td>{getRecruiterNames(item)}</td>
                    <td>{formatDay(item.createdAt)}</td>
                    <td>{formatDay(item.targetDate)}</td>
                    <td>{Number.isFinite(item.daysOpen) ? `${item.daysOpen} ngày` : "—"}</td>
                    <td>{item.isOverdue ? <strong className="s308-warning">⚠ {remainingLabel(item.daysRemaining)}</strong> : remainingLabel(item.daysRemaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleItems.length && <p className="s308-empty">Không có yêu cầu phù hợp với bộ lọc.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
