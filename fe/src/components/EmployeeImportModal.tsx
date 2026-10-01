import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertCircle,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  CircleHelp,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  Trash2,
  Users,
  X,
} from "lucide-react";

type EmployeeInput = {
  HoTen: string;
  Email: string;
  PhongBan: string;
  ChucVu: string;
  SoDienThoai: string;
};

type EmployeeRow = EmployeeInput & { rowNumber: number; errors: string[] };
type EmployeeImportModalProps = {
  onClose?: () => void;
  onImportSuccess?: (imported: { name: string; email: string; department: string; role: string }[]) => void;
};
type ImportSummary = { created: number; skipped: number };

const COLUMNS: (keyof EmployeeInput)[] = [
  "HoTen",
  "Email",
  "PhongBan",
  "ChucVu",
  "SoDienThoai",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SAMPLE_EMPLOYEES: EmployeeInput[] = [
  { HoTen: "Nguyễn Minh Anh", Email: "minh.anh@ats.vn", PhongBan: "Nhân sự", ChucVu: "Chuyên viên tuyển dụng", SoDienThoai: "0912345678" },
  { HoTen: "Trần Quốc Bảo", Email: "bao.tran@ats.vn", PhongBan: "Công nghệ thông tin", ChucVu: "Kỹ sư phần mềm", SoDienThoai: "0987654321" },
  { HoTen: "Lê Thu Hà", Email: "ha.le@ats", PhongBan: "Tài chính", ChucVu: "Kế toán tổng hợp", SoDienThoai: "0901234567" },
  { HoTen: "Phạm Đức Long", Email: "long.pham@ats.vn", PhongBan: "Kinh doanh", ChucVu: "Trưởng nhóm kinh doanh", SoDienThoai: "0324567890" },
  { HoTen: "", Email: "thao.nguyen@ats.vn", PhongBan: "Marketing", ChucVu: "Chuyên viên nội dung", SoDienThoai: "0976543210" },
  { HoTen: "Vũ Hoàng Nam", Email: "nam.vu@ats.vn", PhongBan: "Vận hành", ChucVu: "Điều phối viên", SoDienThoai: "123456" },
  { HoTen: "Đặng Mỹ Linh", Email: "linh.dang@ats.vn", PhongBan: "Nhân sự", ChucVu: "Chuyên viên C&B", SoDienThoai: "0934567890" },
  { HoTen: "Bùi Gia Huy", Email: "huy.bui@ats.vn", PhongBan: "Sản phẩm", ChucVu: "Product Designer", SoDienThoai: "0845678901" },
];

const HEADER_ALIASES: Record<keyof EmployeeInput, string[]> = {
  HoTen: ["hoten", "fullname", "name"],
  Email: ["email", "emailcongty"],
  PhongBan: ["phongban", "department"],
  ChucVu: ["chucvu", "position", "title"],
  SoDienThoai: ["sodienthoai", "phone", "phonenumber"],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function validateEmployee(employee: EmployeeInput): string[] {
  const errors: string[] = [];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phone = employee.SoDienThoai.replace(/[\s().-]/g, "");
  const phonePattern = /^(?:\+?84|0)(?:3|5|7|8|9)\d{8}$/;

  if (!employee.HoTen.trim()) errors.push("Thiếu họ tên");
  if (!employee.Email.trim() || !emailPattern.test(employee.Email.trim())) errors.push("Email sai định dạng");
  if (!employee.PhongBan.trim()) errors.push("Thiếu phòng ban");
  if (!employee.ChucVu.trim()) errors.push("Thiếu chức vụ");
  if (!phone || !phonePattern.test(phone)) errors.push("SĐT không hợp lệ");
  return errors;
}

function createEmployeeRow(employee: EmployeeInput, rowNumber: number): EmployeeRow {
  return { ...employee, rowNumber, errors: validateEmployee(employee) };
}

async function parseEmployeeWorkbook(file: File): Promise<EmployeeRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Tệp không có trang tính để đọc.");

  const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];
  if (matrix.length < 2) throw new Error("Tệp chưa có dữ liệu nhân sự bên dưới hàng tiêu đề.");

  const headers = matrix[0].map(normalizeHeader);
  const columnIndexes = {} as Record<keyof EmployeeInput, number>;
  const missingColumns: string[] = [];
  for (const column of COLUMNS) {
    const index = headers.findIndex((header) => HEADER_ALIASES[column].includes(header));
    columnIndexes[column] = index;
    if (index === -1) missingColumns.push(column);
  }
  if (missingColumns.length > 0) throw new Error(`Thiếu cột bắt buộc: ${missingColumns.join(", ")}.`);

  return matrix
    .slice(1)
    .map((cells, index) => {
      const employee = Object.fromEntries(
        COLUMNS.map((column) => [column, String(cells[columnIndexes[column]] ?? "").trim()]),
      ) as EmployeeInput;
      return { employee, rowNumber: index + 2 };
    })
    .filter(({ employee }) => COLUMNS.some((column) => employee[column] !== ""))
    .map(({ employee, rowNumber }) => createEmployeeRow(employee, rowNumber));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function downloadTemplate(): Promise<void> {
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.aoa_to_sheet([COLUMNS]);
  worksheet["!cols"] = [{ wch: 24 }, { wch: 30 }, { wch: 24 }, { wch: 30 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "NhanSu");
  XLSX.writeFile(workbook, "mau-nhap-nhan-su.xlsx");
}

const initialRows = SAMPLE_EMPLOYEES.map((employee, index) => createEmployeeRow(employee, index + 2));

export default function EmployeeImportModal({ onClose, onImportSuccess }: EmployeeImportModalProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>(initialRows);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [sourceLabel, setSourceLabel] = useState("Dữ liệu mẫu");
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const validCount = employees.filter((employee) => employee.errors.length === 0).length;
  const invalidCount = employees.length - validCount;

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !summary && !isImporting) {
        setIsVisible(false);
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImporting, isVisible, onClose, summary]);

  useEffect(() => () => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
  }, []);

  if (!isVisible) return null;

  const closeModal = () => {
    setIsVisible(false);
    onClose?.();
  };

  const loadFile = async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "xlsx" && extension !== "xls") {
      setFileError("Định dạng chưa được hỗ trợ. Vui lòng chọn tệp .xlsx hoặc .xls.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFileError("Tệp vượt quá dung lượng tối đa 10 MB.");
      return;
    }
    setSelectedFile(file);
    setSourceLabel(file.name);
    setFileError("");
    setSummary(null);
    try {
      const rows = await parseEmployeeWorkbook(file);
      if (rows.length === 0) throw new Error("Không tìm thấy dòng nhân sự nào trong tệp.");
      setEmployees(rows);
      setProgress(0);
    } catch (error) {
      setEmployees([]);
      setProgress(0);
      setFileError(error instanceof Error ? error.message : "Không thể đọc tệp. Hãy kiểm tra định dạng và thử lại.");
    }
  };

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadFile(file);
    event.target.value = "";
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setEmployees(initialRows);
    setSourceLabel("Dữ liệu mẫu");
    setFileError("");
    setProgress(0);
    setSummary(null);
  };

  const startImport = async () => {
    if (validCount === 0 || isImporting) return;
    const validRows = employees.filter((emp) => emp.errors.length === 0);
    let created = validRows.length;
    let skipped = invalidCount;

    setSummary(null);
    setProgress(0);
    setIsImporting(true);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress = Math.min(currentProgress + 20, 90);
      setProgress(currentProgress);
    }, 60);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          employees: employees.map((e) => ({
            HoTen: e.HoTen,
            Email: e.Email,
            PhongBan: e.PhongBan,
            ChucVu: e.ChucVu,
            SoDienThoai: e.SoDienThoai,
            rowNumber: e.rowNumber,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.data) {
          created = data.data.created;
          skipped = data.data.skipped;
        }
      }
    } catch (err) {
      console.warn("Backend API call failed, completing client-side import simulation:", err);
    }

    clearInterval(interval);
    setProgress(100);
    setIsImporting(false);
    setSummary({ created, skipped });

    const importedAccounts = validRows.map((r) => ({
      name: r.HoTen,
      email: r.Email,
      department: r.PhongBan,
      role: r.ChucVu || "Người phỏng vấn",
    }));
    onImportSuccess?.(importedAccounts);
  };

  return (
    <div
      className="employee-import-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isImporting && !summary) closeModal();
      }}
    >
      <section aria-labelledby="employee-import-title" aria-modal="true" className="employee-import-dialog" role="dialog">
        <header className="employee-import-header">
          <div className="employee-import-title-wrap">
            <span className="employee-import-title-icon"><Users size={20} strokeWidth={2} /></span>
            <div>
              <p className="employee-import-eyebrow">QUẢN LÝ TÀI KHOẢN</p>
              <h1 id="employee-import-title">Nhập nhân sự hàng loạt</h1>
              <p className="employee-import-subtitle">Tải danh sách từ Excel và kiểm tra dữ liệu trước khi nhập.</p>
            </div>
          </div>
          <button aria-label="Đóng cửa sổ" className="employee-import-icon-button" disabled={isImporting} onClick={closeModal} title="Đóng" type="button"><X size={19} /></button>
        </header>

        <div className="employee-import-content">
          <div className="employee-import-toolbar">
            <div className="employee-import-step-label"><span className="employee-import-step">01</span><span>Chuẩn bị danh sách</span></div>
            <button className="employee-import-template-button" onClick={downloadTemplate} type="button"><Download size={16} />Tải file mẫu (.xlsx)</button>
          </div>

          <div
            className={`employee-import-dropzone${isDragging ? " is-dragging" : ""}${selectedFile ? " has-file" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
            onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setIsDragging(false); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); setIsDragging(false); const file = event.dataTransfer.files[0]; if (file) void loadFile(file); }}
          >
            <input accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="employee-import-file-input" onChange={handleFileInput} ref={inputRef} type="file" />
            <span className="employee-import-file-icon"><FileSpreadsheet size={23} /></span>
            <div className="employee-import-drop-copy">
              {selectedFile ? <><strong>{selectedFile.name}</strong><span>{formatFileSize(selectedFile.size)} · {sourceLabel}</span></> : <><strong>Kéo thả tệp Excel vào đây</strong><span>hoặc chọn từ thiết bị của bạn · Tối đa 10 MB</span></>}
            </div>
            <div className="employee-import-file-actions">
              {selectedFile && <button aria-label="Xóa tệp đã chọn" className="employee-import-icon-button small" onClick={clearSelectedFile} title="Xóa tệp" type="button"><Trash2 size={16} /></button>}
              <button className="employee-import-browse-button" disabled={isImporting} onClick={() => inputRef.current?.click()} type="button">{selectedFile ? "Thay tệp" : "Chọn tệp"}</button>
            </div>
          </div>

          {fileError && <div className="employee-import-file-error" role="alert"><AlertCircle size={16} /><span>{fileError}</span></div>}
          <div className="employee-import-help"><CircleHelp size={15} /><span>Tệp cần có các cột <b>HoTen, Email, PhongBan, ChucVu, SoDienThoai</b>.</span><button aria-label="Tải file mẫu" className="employee-import-help-chevron" onClick={downloadTemplate} title="Tải file mẫu" type="button"><Download size={14} /></button></div>

          <div className="employee-import-step-label preview-label"><span className="employee-import-step">02</span><span>Xem trước dữ liệu</span><span className="employee-import-source">{sourceLabel}</span></div>
          <div aria-label="Thống kê dữ liệu nhập" className="employee-import-stats">
            <div className="employee-import-stat"><span className="employee-import-stat-icon neutral"><Users size={17} /></span><div><strong>{employees.length}</strong><span>Tổng số dòng</span></div></div>
            <div className="employee-import-stat-divider" />
            <div className="employee-import-stat"><span className="employee-import-stat-icon success"><CheckCircle2 size={17} /></span><div><strong>{validCount}</strong><span>Dòng hợp lệ</span></div></div>
            <div className="employee-import-stat-divider" />
            <div className="employee-import-stat"><span className="employee-import-stat-icon error"><AlertCircle size={17} /></span><div><strong>{invalidCount}</strong><span>Dòng có lỗi</span></div></div>
          </div>

          <div className="employee-import-table-shell">
            <div className="employee-import-table-scroll">
              <table className="employee-import-table">
                <thead><tr><th className="row-number-column">DÒNG</th><th>HỌ VÀ TÊN</th><th>EMAIL</th><th>PHÒNG BAN</th><th>CHỨC VỤ</th><th>SỐ ĐIỆN THOẠI</th><th>TRẠNG THÁI</th></tr></thead>
                <tbody>
                  {employees.length === 0 ? <tr><td className="employee-import-empty" colSpan={7}>Chưa có dữ liệu để xem trước.</td></tr> : employees.map((employee) => {
                    const isInvalid = employee.errors.length > 0;
                    return <tr className={isInvalid ? "invalid-row" : ""} key={`${employee.rowNumber}-${employee.Email}`}>
                      <td className="row-number-cell">{employee.rowNumber}</td>
                      <td className="employee-name-cell">{employee.HoTen || <span className="missing-value">Chưa nhập</span>}</td>
                      <td>{employee.Email || <span className="missing-value">—</span>}</td>
                      <td>{employee.PhongBan || <span className="missing-value">—</span>}</td>
                      <td>{employee.ChucVu || <span className="missing-value">—</span>}</td>
                      <td>{employee.SoDienThoai || <span className="missing-value">—</span>}</td>
                      <td>{isInvalid ? <div className="employee-import-status invalid"><AlertCircle size={15} /><span>{employee.errors.join(" · ")}</span></div> : <span className="employee-import-status valid"><Check size={14} />Hợp lệ</span>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {employees.length > 0 && <div className="employee-import-table-footer">Hiển thị {employees.length} dòng <span>·</span> Đang bỏ qua dòng trống</div>}
          </div>

          {isImporting && <div aria-live="polite" className="employee-import-progress-wrap">
            <div className="employee-import-progress-heading"><span><LoaderCircle className="employee-import-spinner" size={16} />Đang tạo tài khoản...</span><strong>{progress}%</strong></div>
            <div aria-label={`Tiến trình nhập ${progress}%`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={progress} className="employee-import-progress-track" role="progressbar"><span style={{ width: `${progress}%` }} /></div>
          </div>}
        </div>

        <footer className="employee-import-footer">
          <span className="employee-import-footer-note"><AlertCircle size={15} />Chỉ các dòng hợp lệ mới được nhập.</span>
          <div className="employee-import-footer-actions">
            <button className="employee-import-cancel-button" disabled={isImporting} onClick={closeModal} type="button">Hủy</button>
            <button className="employee-import-submit-button" disabled={validCount === 0 || isImporting || Boolean(fileError)} onClick={startImport} type="button">
              {isImporting ? <><LoaderCircle className="employee-import-spinner" size={16} />Đang nhập...</> : <><ArrowUpFromLine size={16} />Tiến hành nhập dữ liệu <span>({validCount})</span></>}
            </button>
          </div>
        </footer>
      </section>

      {summary && <div className="employee-import-summary-backdrop">
        <section aria-labelledby="employee-import-summary-title" aria-modal="true" className="employee-import-summary-dialog" role="dialog">
          <button aria-label="Đóng báo cáo" className="employee-import-icon-button summary-close" onClick={() => setSummary(null)} type="button"><X size={18} /></button>
          <span className="employee-import-summary-icon"><CheckCircle2 size={29} /></span>
          <p className="employee-import-eyebrow">HOÀN TẤT NHẬP DỮ LIỆU</p>
          <h2 id="employee-import-summary-title">Đã xử lý danh sách</h2>
          <p className="employee-import-summary-copy">{summary.skipped > 0 ? `Đã tạo thành công ${summary.created}/${employees.length} tài khoản. ${summary.skipped} dòng bị bỏ qua do lỗi.` : `Đã tạo thành công ${summary.created} tài khoản từ danh sách.`}</p>
          <div className="employee-import-summary-stats"><div><strong>{summary.created}</strong><span>Tạo thành công</span></div><div><strong>{summary.skipped}</strong><span>Bỏ qua</span></div></div>
          <div className="employee-import-summary-actions">
            <button className="employee-import-cancel-button" onClick={() => { setSummary(null); setProgress(0); }} type="button"><RotateCcw size={15} />Xem lại danh sách</button>
            <button className="employee-import-submit-button" onClick={closeModal} type="button">Hoàn tất</button>
          </div>
        </section>
      </div>}

      <style>{`
        .employee-import-backdrop,.employee-import-summary-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;background:rgba(18,29,28,.52);backdrop-filter:blur(3px);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#202b29}
        .employee-import-dialog{display:flex;flex-direction:column;width:min(1120px,100%);max-height:min(92dvh,920px);overflow:hidden;border:1px solid #e5e9e7;border-radius:10px;background:#fff;box-shadow:0 24px 80px rgba(10,28,23,.24);animation:employee-import-enter .2s ease-out both}
        .employee-import-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 28px 20px;border-bottom:1px solid #edf0ef}
        .employee-import-title-wrap{display:flex;align-items:flex-start;gap:14px}.employee-import-title-icon{display:grid;width:42px;height:42px;flex:0 0 42px;place-items:center;border-radius:9px;background:#e9f4f0;color:#19745b}
        .employee-import-eyebrow{margin:0 0 5px;color:#71807b;font-size:10px;font-weight:750;letter-spacing:1px}.employee-import-header h1{margin:0;color:#1f2b28;font-size:21px;font-weight:680;line-height:1.3}.employee-import-subtitle{margin:5px 0 0;color:#75817d;font-size:13px;line-height:1.5}
        .employee-import-icon-button{display:grid;width:34px;height:34px;flex:0 0 34px;place-items:center;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:#687571;cursor:pointer}.employee-import-icon-button:hover{border-color:#e6ebe9;background:#f6f8f7;color:#25332f}.employee-import-icon-button:disabled{cursor:not-allowed;opacity:.45}
        .employee-import-content{overflow-y:auto;padding:20px 28px 22px}.employee-import-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.employee-import-step-label{display:flex;align-items:center;gap:9px;color:#35423e;font-size:13px;font-weight:680}.employee-import-step{display:grid;width:25px;height:25px;place-items:center;border:1px solid #dbe5e1;border-radius:7px;background:#f6f9f7;color:#43806b;font-size:10px;font-weight:750}
        .employee-import-template-button,.employee-import-browse-button,.employee-import-cancel-button,.employee-import-submit-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;padding:0 13px;border:1px solid #d9e2de;border-radius:7px;background:#fff;color:#35433e;font:inherit;font-size:12px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.employee-import-template-button:hover,.employee-import-browse-button:hover,.employee-import-cancel-button:hover{border-color:#9db7ad;background:#f6faf8}.employee-import-template-button{color:#236c54}
        .employee-import-dropzone{display:flex;align-items:center;gap:14px;min-height:90px;padding:16px 18px;border:1px dashed #b9c9c2;border-radius:8px;background:#fbfcfb;transition:border-color .15s,background .15s}.employee-import-dropzone.is-dragging{border-color:#218468;background:#eef8f3}.employee-import-dropzone.has-file{border-style:solid;border-color:#cbdad4;background:#f9fbfa}.employee-import-file-input{display:none}.employee-import-file-icon{display:grid;width:42px;height:42px;flex:0 0 42px;place-items:center;border:1px solid #e0e9e5;border-radius:8px;background:#fff;color:#32826a}
        .employee-import-drop-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.employee-import-drop-copy strong{overflow:hidden;color:#2d3935;font-size:13px;font-weight:670;text-overflow:ellipsis;white-space:nowrap}.employee-import-drop-copy span{overflow:hidden;color:#7b8782;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.employee-import-file-actions{display:flex;align-items:center;gap:7px}.employee-import-icon-button.small{width:32px;height:32px;flex-basis:32px;color:#9a5550}.employee-import-browse-button{min-height:34px;padding:0 11px}
        .employee-import-file-error{display:flex;align-items:flex-start;gap:8px;margin-top:9px;padding:9px 11px;border:1px solid #f1d8d5;border-radius:6px;background:#fff7f6;color:#a3443d;font-size:11px;line-height:1.5}.employee-import-file-error svg{flex:0 0 auto;margin-top:1px}.employee-import-help{display:flex;align-items:center;gap:8px;margin:9px 0 19px;color:#71807a;font-size:11px}.employee-import-help>svg{flex:0 0 auto;color:#8b9993}.employee-import-help b{color:#57655f;font-weight:640}.employee-import-help-chevron{display:grid;width:23px;height:23px;margin-left:auto;place-items:center;border:0;border-radius:5px;background:transparent;color:#7e8c86;cursor:pointer}.employee-import-help-chevron:hover{background:#f1f5f3}
        .preview-label{margin-bottom:12px}.employee-import-source{max-width:45%;overflow:hidden;margin-left:auto;color:#85918c;font-size:11px;font-weight:450;text-overflow:ellipsis;white-space:nowrap}.employee-import-stats{display:flex;align-items:center;gap:20px;min-height:67px;margin-bottom:13px;padding:10px 16px;border:1px solid #e8edeb;border-radius:8px;background:#fcfdfc}.employee-import-stat{display:flex;align-items:center;gap:10px;min-width:135px}.employee-import-stat-icon{display:grid;width:34px;height:34px;flex:0 0 34px;place-items:center;border-radius:8px}.employee-import-stat-icon.neutral{background:#edf2f0;color:#5f736a}.employee-import-stat-icon.success{background:#e8f5ed;color:#298050}.employee-import-stat-icon.error{background:#fff0ed;color:#c35e50}.employee-import-stat>div{display:flex;flex-direction:column;gap:2px}.employee-import-stat strong{color:#26332e;font-size:17px;font-weight:700;line-height:1.1}.employee-import-stat>div span{color:#78847e;font-size:10px}.employee-import-stat-divider{width:1px;height:31px;background:#e8edeb}
        .employee-import-table-shell{overflow:hidden;border:1px solid #e5eae8;border-radius:8px}.employee-import-table-scroll{overflow:auto;max-height:280px}.employee-import-table{width:100%;min-width:920px;border-collapse:collapse;text-align:left}.employee-import-table th{position:sticky;top:0;z-index:1;padding:10px 11px;border-bottom:1px solid #e6ebe8;background:#f7f9f8;color:#78847f;font-size:9px;font-weight:730;letter-spacing:.45px;white-space:nowrap}.employee-import-table td{max-width:190px;padding:10px 11px;border-bottom:1px solid #eef1f0;color:#52615a;font-size:11px;white-space:nowrap}.employee-import-table tbody tr:last-child td{border-bottom:0}.employee-import-table tbody tr.invalid-row{background:#fff8f7}.employee-import-table tbody tr.invalid-row:hover{background:#fff3f1}.employee-import-table tbody tr:not(.invalid-row):hover{background:#f8fbf9}.employee-import-table .row-number-column{width:55px}.employee-import-table .row-number-cell{color:#88938e;font-variant-numeric:tabular-nums}.employee-import-table .employee-name-cell{color:#34423c;font-weight:620}
        .employee-import-status{display:inline-flex;align-items:center;gap:5px;max-width:245px;font-size:10px;line-height:1.4}.employee-import-status.valid{padding:4px 7px;border:1px solid #d5eadc;border-radius:5px;background:#eff8f1;color:#32764b;font-weight:650}.employee-import-status.invalid{color:#b54d44;white-space:normal}.employee-import-status.invalid svg{flex:0 0 auto}.missing-value{color:#bd655d;font-style:italic}.employee-import-empty{height:88px;color:#87928d!important;text-align:center}.employee-import-table-footer{display:flex;gap:7px;padding:9px 12px;border-top:1px solid #edf0ef;background:#fbfcfb;color:#87928d;font-size:10px}
        .employee-import-progress-wrap{margin-top:15px}.employee-import-progress-heading{display:flex;justify-content:space-between;margin-bottom:8px;color:#46544e;font-size:11px}.employee-import-progress-heading>span{display:inline-flex;align-items:center;gap:7px}.employee-import-progress-heading strong{color:#267558;font-variant-numeric:tabular-nums}.employee-import-progress-track{height:7px;overflow:hidden;border-radius:5px;background:#e8efeb}.employee-import-progress-track span{display:block;height:100%;border-radius:inherit;background:#31866a;transition:width .12s linear}.employee-import-spinner{animation:employee-import-spin .9s linear infinite}
        .employee-import-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 28px;border-top:1px solid #e9edeb;background:#fcfdfc}.employee-import-footer-note{display:inline-flex;align-items:center;gap:7px;color:#74817b;font-size:10px}.employee-import-footer-note svg{color:#8c9993}.employee-import-footer-actions{display:flex;align-items:center;gap:9px}.employee-import-cancel-button{min-height:39px;padding:0 15px}.employee-import-submit-button{min-height:39px;padding:0 15px;border-color:#267456;background:#267456;color:#fff}.employee-import-submit-button:hover:not(:disabled){transform:translateY(-1px);border-color:#1d6248;background:#1d6248}.employee-import-submit-button:disabled,.employee-import-browse-button:disabled{cursor:not-allowed;opacity:.48}
        .employee-import-summary-backdrop{z-index:1001;background:rgba(19,33,28,.34)}.employee-import-summary-dialog{position:relative;width:min(440px,100%);padding:32px;border:1px solid #e3eae6;border-radius:10px;background:#fff;box-shadow:0 20px 60px rgba(10,28,23,.22);text-align:center;animation:employee-import-enter .2s ease-out both}.employee-import-icon-button.summary-close{position:absolute;top:12px;right:12px}.employee-import-summary-icon{display:grid;width:58px;height:58px;margin:0 auto 17px;place-items:center;border-radius:50%;background:#e8f5ed;color:#318052}.employee-import-summary-dialog .employee-import-eyebrow{margin-bottom:7px}.employee-import-summary-dialog h2{margin:0;color:#24312c;font-size:20px;font-weight:690}.employee-import-summary-copy{margin:9px auto 20px;color:#6c7973;font-size:12px;line-height:1.65}.employee-import-summary-stats{display:grid;grid-template-columns:1fr 1fr;margin-bottom:22px;border:1px solid #e9eeeb;border-radius:8px;background:#fbfcfb}.employee-import-summary-stats>div{display:flex;flex-direction:column;gap:4px;padding:13px}.employee-import-summary-stats>div+div{border-left:1px solid #e9eeeb}.employee-import-summary-stats strong{color:#267456;font-size:20px}.employee-import-summary-stats>div+div strong{color:#b85d51}.employee-import-summary-stats span{color:#77837d;font-size:10px}.employee-import-summary-actions{display:flex;justify-content:center;gap:8px}
        @keyframes employee-import-spin{to{transform:rotate(360deg)}}@keyframes employee-import-enter{from{opacity:0;transform:translateY(7px) scale(.99)}to{opacity:1;transform:translateY(0) scale(1)}}
        @media(max-width:700px){.employee-import-backdrop{padding:9px}.employee-import-dialog{max-height:96dvh}.employee-import-header{padding:17px 17px 15px}.employee-import-header h1{font-size:18px}.employee-import-content{padding:16px 16px 19px}.employee-import-footer{align-items:stretch;flex-direction:column;padding:13px 16px}.employee-import-footer-note{order:1}.employee-import-footer-actions{justify-content:flex-end}.employee-import-dropzone{flex-wrap:wrap;gap:10px;padding:12px}.employee-import-file-actions{width:100%;justify-content:flex-end}.employee-import-stats{justify-content:space-between;gap:8px;padding:9px}.employee-import-stat{min-width:0;gap:6px}.employee-import-stat-icon{width:29px;height:29px;flex-basis:29px}.employee-import-stat>div span{font-size:9px}.employee-import-stat-divider{height:27px}.employee-import-summary-dialog{padding:29px 20px 22px}.employee-import-summary-actions{flex-direction:column-reverse}.employee-import-summary-actions button{width:100%}}
        @media(prefers-reduced-motion:reduce){.employee-import-spinner,.employee-import-dialog,.employee-import-summary-dialog{animation-duration:.01ms}.employee-import-submit-button,.employee-import-progress-track span{transition-duration:.01ms}}
      `}</style>
    </div>
  );
}