import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Mail,
  Phone,
  Save,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "./candidate-cv-parser.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const API_URL = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type CandidateForm = {
  fullName: string;
  email: string;
  phone: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

type CreatedCandidate = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
};

type BackendParseResult = {
  fullName: string;
  email: string;
  phone: string;
  rawText: string;
  isParsed: boolean;
  message?: string;
  fieldsExtracted?: {
    fullName: boolean;
    email: boolean;
    phone: boolean;
  };
};

const EMPTY_FORM: CandidateForm = {
  fullName: "",
  email: "",
  phone: "",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractEmail(text: string): string {
  const match = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/i);
  return match?.[0]?.trim().toLowerCase() || "";
}

function extractPhone(text: string): string {
  const vnRegex = /(?:(?:\+?84|0)(?:[ .-]*\d){9,10})\b/g;
  const candidates = text.match(vnRegex) || [];
  const firstPhone = candidates[0];
  if (!firstPhone) return "";
  const cleaned = firstPhone.replace(/[ .-]+/g, "");
  if (cleaned.startsWith("84") && !cleaned.startsWith("+")) {
    return "+" + cleaned;
  }
  return cleaned;
}

function extractName(lines: string[]): string {
  // 1. Kiểm tra nhãn
  for (const line of lines) {
    const labelMatch = line.match(
      /(?:h[oọ]\s*(?:v[aà]|&)?\s*t[eê]n|full\s*name|h[oọ]\s*t[eê]n|name|[uứ]ng\s*vi[eê]n)\s*[:\-.]\s*(.+)/i
    );
    if (labelMatch?.[1]) {
      const candidate = labelMatch[1]
        .replace(/\s+(?:email|e-mail|phone|sđt|sdt|điện\s*thoại|tel|mobile|địa\s*chỉ|address)\b.*$/i, "")
        .replace(/[|;].*$/, "")
        .trim();
      if (candidate.length >= 2 && candidate.length <= 50 && !/@|\d/.test(candidate)) {
        return candidate;
      }
    }
  }

  // 2. Quét các dòng đầu
  const blacklistRegex =
    /curriculum|resume|cv\b|sơ yếu|thông tin|liên hệ|mục tiêu|kinh nghiệm|học vấn|kỹ năng|dự án|chứng chỉ|vị trí|developer|engineer|designer|manager|intern|fresher|junior|senior|email|phone|điện thoại|địa chỉ|github|linkedin|facebook|http|www\.|tốt nghiệp|đại học|cao đẳng/i;

  for (const rawLine of lines.slice(0, 15)) {
    const cleaned = normalizeWhitespace(rawLine);
    if (!cleaned || cleaned.length < 3 || cleaned.length > 50) continue;
    if (blacklistRegex.test(cleaned)) continue;
    if (/@|\d|https?:|\.com/i.test(cleaned)) continue;

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      if (words.every((word) => /^[A-Za-zÀ-ỹĐđ.\-']+$/u.test(word))) {
        return cleaned;
      }
    }
  }

  return "";
}

async function readPdfTextClient(file: File): Promise<{ lines: string[]; text: string }> {
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageLines = content.items
      .map((item) => ("str" in item ? String(item.str).trim() : ""))
      .filter(Boolean);
    lines.push(...pageLines);
  }

  return {
    lines,
    text: lines.join("\n"),
  };
}

export default function CandidateCvParser() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState<CandidateForm>(EMPTY_FORM);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [extractError, setExtractError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [createdCandidate, setCreatedCandidate] = useState<CreatedCandidate | null>(null);

  const canSave = useMemo(
    () =>
      form.fullName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()),
    [form]
  );

  function edit(field: keyof CandidateForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setError("");
    setNotice("");
    setCreatedCandidate(null);
  }

  async function handleFile(selected?: File) {
    if (!selected) return;

    setFile(selected);
    setExtractError("");
    setError("");
    setNotice("");
    setCreatedCandidate(null);

    if (
      selected.type !== "application/pdf" &&
      !selected.name.toLowerCase().endsWith(".pdf")
    ) {
      setExtractError("Hệ thống chỉ hỗ trợ bóc tách CV định dạng PDF.");
      return;
    }

    setExtracting(true);

    try {
      let extracted: CandidateForm = EMPTY_FORM;
      let hasParsed = false;
      const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");

      // 1. Thử gọi Backend API /api/candidates/parse-cv
      try {
        const formData = new FormData();
        formData.append("cv", selected);

        const beResponse = await fetch(`${API_URL}/api/candidates/parse-cv`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (beResponse.ok) {
          const beResult = (await beResponse.json()) as ApiResponse<BackendParseResult>;
          if (beResult.success && beResult.data) {
            extracted = {
              fullName: beResult.data.fullName || "",
              email: beResult.data.email || "",
              phone: beResult.data.phone || "",
            };
            hasParsed = Boolean(beResult.data.isParsed);
          }
        }
      } catch (beError) {
        console.warn("Backend parse-cv failed, falling back to client-side extraction:", beError);
      }

      // 2. Nếu Backend chưa bóc tách được (ví dụ offline hoặc chưa đủ), dùng client-side pdfjs fallback
      if (!hasParsed && (!extracted.fullName || !extracted.email)) {
        try {
          const { lines, text } = await readPdfTextClient(selected);
          if (text.trim()) {
            extracted = {
              fullName: extracted.fullName || extractName(lines),
              email: extracted.email || extractEmail(text),
              phone: extracted.phone || extractPhone(text),
            };
            hasParsed = Boolean(extracted.fullName || extracted.email || extracted.phone);
          }
        } catch (clientErr) {
          console.warn("Client pdf read failed:", clientErr);
        }
      }

      // Điền thông tin vào form cho Recruiter xem và sửa (không tự động lưu)
      setForm(extracted);

      if (!hasParsed || (!extracted.fullName && !extracted.email && !extracted.phone)) {
        setExtractError(
          "Không thể bóc tách nội dung từ tệp PDF này (tệp scan hoặc không có lớp văn bản). Bạn vẫn có thể nhập thông tin ứng viên thủ công bên dưới để tiếp tục lưu hồ sơ."
        );
      } else if (!extracted.fullName || !extracted.email || !extracted.phone) {
        setNotice(
          "Đã bóc tách được một số thông tin từ CV. Recruiter vui lòng kiểm tra và nhập bổ sung các trường còn thiếu trước khi xác nhận."
        );
      } else {
        setNotice(
          "Đã bóc tách thông tin từ CV thành công. Vui lòng kiểm tra và chỉnh sửa trước khi xác nhận lưu."
        );
      }
    } catch (cause) {
      console.error("CV extraction failed:", cause);
      setExtractError(
        "Không thể bóc tách CV này. Bạn vẫn có thể nhập họ tên, email và số điện thoại thủ công để tiếp tục lưu hồ sơ."
      );
      setForm(EMPTY_FORM);
    } finally {
      setExtracting(false);
    }
  }

  function clearFile() {
    setFile(null);
    setForm(EMPTY_FORM);
    setExtractError("");
    setError("");
    setNotice("");
    setCreatedCandidate(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  async function saveCandidate() {
    setError("");
    setNotice("");
    setCreatedCandidate(null);

    if (!form.fullName.trim()) {
      setError("Vui lòng nhập họ tên ứng viên.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    setSaving(true);

    try {
      const token = sessionStorage.getItem("accessToken") || localStorage.getItem("accessToken");

      const response = await fetch(`${API_URL}/api/candidates`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
        }),
      });

      const result = (await response.json()) as ApiResponse<CreatedCandidate>;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error?.message || "Không thể tạo hồ sơ ứng viên.");
      }

      setCreatedCandidate(result.data);
      setNotice("Đã xác nhận và lưu thông tin ứng viên vào hệ thống thành công!");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Không thể lưu thông tin ứng viên."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="s404-page">
      <header className="s404-header">
        <div>
          <span className="s404-eyebrow">QUẢN LÝ ỨNG VIÊN</span>
          <h1>Bóc tách thông tin từ CV ứng viên</h1>
          <p>
            Tải tệp CV định dạng PDF để tự động điền họ tên, email và số điện thoại.
            Nhân viên tuyển dụng (Recruiter) có thể kiểm tra và chỉnh sửa trước khi bấm lưu.
          </p>
        </div>
      </header>

      {notice && (
        <div className="s404-alert s404-alert--success" role="status">
          <CheckCircle2 size={19} />
          <span>{notice}</span>
        </div>
      )}

      {extractError && (
        <div className="s404-alert s404-alert--warning" role="status">
          <AlertCircle size={19} />
          <span>{extractError}</span>
        </div>
      )}

      {error && (
        <div className="s404-alert s404-alert--error" role="alert">
          <AlertCircle size={19} />
          <span>{error}</span>
        </div>
      )}

      <div className="s404-grid">
        <article className="s404-card">
          <div className="s404-card-heading">
            <div className="s404-card-icon">
              <FileText size={21} />
            </div>
            <div>
              <h2>Tệp CV ứng viên</h2>
              <p>
                Chấp nhận tệp PDF. Thông tin bóc tách chỉ dùng để điền trước biểu mẫu, không tự động ghi đè.
              </p>
            </div>
          </div>

          {!file ? (
            <label className="s404-upload">
              <Upload size={32} />
              <strong>Chọn CV định dạng PDF</strong>
              <span>Bấm vào đây để chọn tệp từ máy tính</span>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  void handleFile(event.target.files?.[0]);
                }}
              />
            </label>
          ) : (
            <div className="s404-selected-file">
              <div>
                <FileText size={22} />
                <div>
                  <strong>{file.name}</strong>
                  <span>{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                disabled={extracting || saving}
                aria-label="Bỏ tệp CV"
                title="Bỏ tệp CV"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {extracting && (
            <div className="s404-processing">
              <LoaderCircle className="s404-spin" size={21} />
              <span>Đang đọc và bóc tách thông tin từ CV PDF...</span>
            </div>
          )}

          <div className="s404-note">
            💡 <strong>Lưu ý:</strong> Nếu PDF là ảnh scan hoặc bóc tách không tìm thấy thông tin,
            hệ thống sẽ giữ biểu mẫu mở để bạn tự do nhập thủ công và lưu hồ sơ bình thường.
          </div>
        </article>

        <article className="s404-card">
          <div className="s404-card-heading">
            <div className="s404-card-icon">
              <UserRound size={21} />
            </div>
            <div>
              <h2>Thông tin ứng viên</h2>
              <p>
                Recruiter xác nhận hoặc chỉnh sửa thông tin trước khi lưu.
              </p>
            </div>
          </div>

          <div className="s404-form">
            <label>
              <span>
                <UserRound size={16} />
                Họ và tên ứng viên *
              </span>
              <input
                value={form.fullName}
                onChange={(event) => edit("fullName", event.target.value)}
                placeholder="Ví dụ: Nguyễn Văn An"
              />
            </label>

            <label>
              <span>
                <Mail size={16} />
                Địa chỉ Email *
              </span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => edit("email", event.target.value)}
                placeholder="Ví dụ: an.nguyen@example.com"
              />
            </label>

            <label>
              <span>
                <Phone size={16} />
                Số điện thoại
              </span>
              <input
                value={form.phone}
                onChange={(event) => edit("phone", event.target.value)}
                placeholder="Ví dụ: 0912345678"
              />
            </label>
          </div>

          <div className="s404-confirm-note">
            ⚠️ <strong>Quy tắc an toàn:</strong> Dữ liệu bóc tách được điền sẵn để bạn kiểm tra.
            Hệ thống <strong>không tự động ghi đè</strong> và chỉ lưu vào CSDL khi bạn nhấn
            nút <strong>Xác nhận và lưu</strong> bên dưới.
          </div>

          <button
            type="button"
            className="s404-save"
            disabled={saving || extracting || !canSave}
            onClick={() => void saveCandidate()}
          >
            {saving ? (
              <LoaderCircle className="s404-spin" size={18} />
            ) : (
              <Save size={18} />
            )}
            {saving ? "Đang lưu hồ sơ ứng viên..." : "Xác nhận và lưu hồ sơ"}
          </button>

          {createdCandidate && (
            <div className="s404-created">
              <CheckCircle2 size={18} />
              <div>
                <strong>Hồ sơ ứng viên đã được lưu thành công!</strong>
                <span>
                  Mã ứng viên: {createdCandidate.id} · {createdCandidate.fullName} ({createdCandidate.email})
                </span>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
