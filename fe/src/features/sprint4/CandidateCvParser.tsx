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

const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type CandidateForm = {
  fullName: string;
  email: string;
  phone: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
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

const EMPTY_FORM: CandidateForm = {
  fullName: "",
  email: "",
  phone: "",
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractEmail(text: string) {
  const match = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );

  return match?.[0]?.trim() || "";
}

function extractPhone(text: string) {
  const candidates =
    text.match(
      /(?:\+?84|0)(?:[\s.-]*\d){9,10}/g,
    ) || [];

  const firstPhone = candidates[0];

  if (!firstPhone) {
    return "";
  }

  return firstPhone
    .replace(/[^\d+]/g, "")
    .replace(/^84/, "+84");
}

function looksLikeName(line: string) {
  const cleaned = normalizeWhitespace(line);

  if (!cleaned || cleaned.length < 4 || cleaned.length > 60) {
    return false;
  }

  if (
    /@|https?:|www\.|linkedin|github|facebook|curriculum|resume|cv\b|email|phone|mobile|điện thoại|số điện thoại|địa chỉ|address/i.test(
      cleaned,
    )
  ) {
    return false;
  }

  if (/\d/.test(cleaned)) {
    return false;
  }

  const words = cleaned.split(" ").filter(Boolean);

  if (words.length < 2 || words.length > 7) {
    return false;
  }

  return words.every((word) =>
    /^[A-Za-zÀ-ỹĐđ'-]+$/u.test(word),
  );
}

function extractName(lines: string[]) {
  const candidate = lines
    .map(normalizeWhitespace)
    .find(looksLikeName);

  return candidate || "";
}

async function readPdfText(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());

  const pdf = await pdfjsLib.getDocument({
    data: bytes,
  }).promise;

  const lines: string[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber += 1
  ) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();

    const pageLines = content.items
      .map((item) =>
        "str" in item ? String(item.str).trim() : "",
      )
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
  const [form, setForm] =
    useState<CandidateForm>(EMPTY_FORM);

  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [extractError, setExtractError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [createdCandidate, setCreatedCandidate] =
    useState<CreatedCandidate | null>(null);

  const canSave = useMemo(
    () =>
      form.fullName.trim().length >= 2 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim(),
      ),
    [form],
  );

  function edit(
    field: keyof CandidateForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setError("");
    setNotice("");
    setCreatedCandidate(null);
  }

  async function handleFile(
    selected?: File,
  ) {
    if (!selected) {
      return;
    }

    setFile(selected);
    setExtractError("");
    setError("");
    setNotice("");
    setCreatedCandidate(null);

    if (
      selected.type !== "application/pdf" &&
      !selected.name.toLowerCase().endsWith(".pdf")
    ) {
      setExtractError(
        "S4-04 chỉ hỗ trợ bóc tách CV định dạng PDF.",
      );
      return;
    }

    setExtracting(true);

    try {
      const { lines, text } =
        await readPdfText(selected);

      if (!text.trim()) {
        throw new Error(
          "Không đọc được nội dung chữ trong PDF.",
        );
      }

      const extracted: CandidateForm = {
        fullName: extractName(lines),
        email: extractEmail(text),
        phone: extractPhone(text),
      };

      setForm(extracted);

      if (
        !extracted.fullName ||
        !extracted.email ||
        !extracted.phone
      ) {
        setExtractError(
          "Bóc tách chưa đầy đủ. Recruiter có thể kiểm tra và nhập bổ sung thủ công trước khi xác nhận.",
        );
      } else {
        setNotice(
          "Đã bóc tách thông tin từ CV. Vui lòng kiểm tra và chỉnh sửa trước khi xác nhận.",
        );
      }
    } catch (cause) {
      console.error("CV extraction failed:", cause);

      setExtractError(
        "Không thể bóc tách CV này. Bạn vẫn có thể nhập họ tên, email và số điện thoại thủ công để tiếp tục.",
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

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email.trim(),
      )
    ) {
      setError(
        "Vui lòng nhập địa chỉ email hợp lệ.",
      );
      return;
    }

    setSaving(true);

    try {
      const token =
        sessionStorage.getItem("accessToken");

      const response = await fetch(
        `${API_URL}/api/candidates`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            phone:
              form.phone.trim() || undefined,
          }),
        },
      );

      const result =
        (await response.json()) as ApiResponse<CreatedCandidate>;

      if (
        !response.ok ||
        !result.success ||
        !result.data
      ) {
        throw new Error(
          result.error?.message ||
            "Không thể tạo hồ sơ ứng viên.",
        );
      }

      setCreatedCandidate(result.data);

      setNotice(
        "Đã xác nhận và lưu thông tin ứng viên.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Không thể lưu thông tin ứng viên.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="s404-page">
      <header className="s404-header">
        <div>
          <span className="s404-eyebrow">
            QUẢN LÝ ỨNG VIÊN
          </span>

          <h1>Bóc tách thông tin từ CV</h1>

          <p>
            Tải CV PDF để điền trước họ tên,
            email và số điện thoại. Recruiter
            phải kiểm tra trước khi lưu.
          </p>
        </div>
      </header>

      {notice && (
        <div
          className="s404-alert s404-alert--success"
          role="status"
        >
          <CheckCircle2 size={19} />
          <span>{notice}</span>
        </div>
      )}

      {extractError && (
        <div
          className="s404-alert s404-alert--warning"
          role="status"
        >
          <AlertCircle size={19} />
          <span>{extractError}</span>
        </div>
      )}

      {error && (
        <div
          className="s404-alert s404-alert--error"
          role="alert"
        >
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
              <h2>CV ứng viên</h2>
              <p>
                Chấp nhận tệp PDF. Thông tin
                chỉ được điền vào biểu mẫu,
                chưa tự lưu.
              </p>
            </div>
          </div>

          {!file ? (
            <label className="s404-upload">
              <Upload size={32} />

              <strong>Chọn CV PDF</strong>

              <span>
                Bấm để chọn tệp từ máy tính
              </span>

              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  void handleFile(
                    event.target.files?.[0],
                  );
                }}
              />
            </label>
          ) : (
            <div className="s404-selected-file">
              <div>
                <FileText size={22} />

                <div>
                  <strong>{file.name}</strong>

                  <span>
                    {(
                      file.size /
                      1024 /
                      1024
                    ).toFixed(2)}{" "}
                    MB
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={clearFile}
                disabled={
                  extracting || saving
                }
                aria-label="Bỏ tệp CV"
              >
                <X size={18} />
              </button>
            </div>
          )}

          {extracting && (
            <div className="s404-processing">
              <LoaderCircle
                className="s404-spin"
                size={21}
              />

              <span>
                Đang đọc và bóc tách CV...
              </span>
            </div>
          )}

          <div className="s404-note">
            Nếu PDF không có lớp văn bản hoặc
            bóc tách thất bại, Recruiter vẫn có
            thể nhập thông tin thủ công.
          </div>
        </article>

        <article className="s404-card">
          <div className="s404-card-heading">
            <div className="s404-card-icon">
              <UserRound size={21} />
            </div>

            <div>
              <h2>
                Thông tin được bóc tách
              </h2>

              <p>
                Kiểm tra và chỉnh sửa trước
                khi xác nhận.
              </p>
            </div>
          </div>

          <div className="s404-form">
            <label>
              <span>
                <UserRound size={16} />
                Họ và tên *
              </span>

              <input
                value={form.fullName}
                onChange={(event) =>
                  edit(
                    "fullName",
                    event.target.value,
                  )
                }
                placeholder="Nguyễn Văn A"
              />
            </label>

            <label>
              <span>
                <Mail size={16} />
                Email *
              </span>

              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  edit(
                    "email",
                    event.target.value,
                  )
                }
                placeholder="candidate@example.com"
              />
            </label>

            <label>
              <span>
                <Phone size={16} />
                Số điện thoại
              </span>

              <input
                value={form.phone}
                onChange={(event) =>
                  edit(
                    "phone",
                    event.target.value,
                  )
                }
                placeholder="09xxxxxxxx"
              />
            </label>
          </div>

          <div className="s404-confirm-note">
            Thông tin chưa được lưu cho đến
            khi Recruiter bấm
            <strong> Xác nhận và lưu</strong>.
          </div>

          <button
            type="button"
            className="s404-save"
            disabled={
              saving ||
              extracting ||
              !canSave
            }
            onClick={() =>
              void saveCandidate()
            }
          >
            {saving ? (
              <LoaderCircle
                className="s404-spin"
                size={18}
              />
            ) : (
              <Save size={18} />
            )}

            {saving
              ? "Đang lưu..."
              : "Xác nhận và lưu"}
          </button>

          {createdCandidate && (
            <div className="s404-created">
              <CheckCircle2 size={18} />

              <div>
                <strong>
                  Hồ sơ đã được tạo
                </strong>

                <span>
                  {createdCandidate.fullName} ·{" "}
                  {createdCandidate.email}
                </span>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}