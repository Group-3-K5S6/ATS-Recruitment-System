import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Upload, X } from 'lucide-react';
import './job-application-form.css';

const MAX_CV_SIZE = 10 * 1024 * 1024;

type ApplicationFields = {
  fullName: string;
  email: string;
  phone: string;
  source: string;
  coverLetter: string;
};

type FieldErrors = Partial<Record<keyof ApplicationFields | 'cv', string>>;

const emptyFields: ApplicationFields = {
  fullName: '',
  email: '',
  phone: '',
  source: '',
  coverLetter: '',
};

async function validateCv(file: File): Promise<string | null> {
  const extension = file.name.match(/\.([^.]+)$/)?.[1]?.toLowerCase();
  if (extension !== 'pdf' && extension !== 'docx') {
    return 'CV chỉ được chấp nhận định dạng PDF hoặc DOCX.';
  }
  if (file.size > MAX_CV_SIZE) {
    return 'Dung lượng CV vượt quá giới hạn 10 MB.';
  }

  const acceptedMimeTypes = extension === 'pdf'
    ? ['application/pdf']
    : ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const mimeType = file.type.toLowerCase();
  if (mimeType && mimeType !== 'application/octet-stream' && !acceptedMimeTypes.includes(mimeType)) {
    return 'Định dạng tệp không khớp với phần mở rộng. Vui lòng chọn CV PDF hoặc DOCX hợp lệ.';
  }

  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = extension === 'pdf'
    && signature.length >= 5
    && signature[0] === 0x25
    && signature[1] === 0x50
    && signature[2] === 0x44
    && signature[3] === 0x46
    && signature[4] === 0x2d;
  const isDocx = extension === 'docx'
    && signature.length >= 4
    && signature[0] === 0x50
    && signature[1] === 0x4b
    && signature[2] === 0x03
    && signature[3] === 0x04;
  if (!isPdf && !isDocx) {
    return 'Tệp không có nội dung PDF hoặc DOCX hợp lệ. Vui lòng kiểm tra lại CV.';
  }

  return null;
}

const API = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';
type ApplyEnvelope = { success: boolean; data?: { trackingCode: string; emailSent?: boolean }; error?: { message?: string } };

export default function JobApplicationForm({ jobId }: { jobId: string }) {
  const [fields, setFields] = useState<ApplicationFields>(emptyFields);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<{ code: string; emailSent: boolean } | null>(null);
  const [isValidatingCv, setIsValidatingCv] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cvValidationVersion = useRef(0);

  function updateField(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = event.currentTarget;
    setFields(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
    setStatus('');
  }

  async function chooseCv(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const selected = input.files?.[0];
    if (!selected) return;

    const validationVersion = ++cvValidationVersion.current;
    setIsValidatingCv(true);
    try {
      const error = await validateCv(selected);
      if (validationVersion !== cvValidationVersion.current) return;

      setErrors(current => ({ ...current, cv: error ?? undefined }));
      setCv(error ? null : selected);
      setStatus('');
      if (error) input.value = '';
    } catch {
      if (validationVersion === cvValidationVersion.current) {
        setErrors(current => ({ ...current, cv: 'Không thể đọc tệp CV. Vui lòng chọn lại tệp.' }));
        setCv(null);
        setStatus('');
        input.value = '';
      }
    } finally {
      if (validationVersion === cvValidationVersion.current) setIsValidatingCv(false);
    }
  }

  function clearCv() {
    cvValidationVersion.current += 1;
    setIsValidatingCv(false);
    setCv(null);
    setErrors(current => ({ ...current, cv: undefined }));
    setStatus('');
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    const nextErrors: FieldErrors = {};
    if (fields.fullName.trim().length < 2 || fields.fullName.trim().length > 100) {
      nextErrors.fullName = 'Họ và tên phải từ 2 đến 100 ký tự.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      nextErrors.email = 'Vui lòng nhập email hợp lệ.';
    }
    if (fields.phone.trim() && !/^[0-9+() -]{8,20}$/.test(fields.phone.trim())) {
      nextErrors.phone = 'Số điện thoại không hợp lệ.';
    }
    if (fields.source.length > 255) nextErrors.source = 'Nguồn biết tin không vượt quá 255 ký tự.';
    if (fields.coverLetter.length > 5000) nextErrors.coverLetter = 'Thư giới thiệu không vượt quá 5000 ký tự.';
    if (!cv) nextErrors.cv = errors.cv || 'Vui lòng đính kèm CV PDF hoặc DOCX, tối đa 10 MB.';

    setErrors(nextErrors);
    if (isValidatingCv) { setStatus('Vui lòng đợi kiểm tra CV hoàn tất.'); return; }
    if (Object.keys(nextErrors).length > 0 || !cv) {
      setStatus('Vui lòng kiểm tra lại các thông tin được đánh dấu.');
      return;
    }

    const body = new FormData();
    body.set('fullName', fields.fullName.trim());
    body.set('email', fields.email.trim());
    body.set('phone', fields.phone.trim());
    body.set('source', fields.source.trim());
    body.set('coverLetter', fields.coverLetter.trim());
    body.set('cv', cv);

    setLoading(true);
    setStatus('');
    try {
      // Công khai: không gửi accessToken hoặc Authorization header của nhân sự.
      const response = await fetch(`${API}/api/public/jobs/${encodeURIComponent(jobId)}/apply`, {
        method: 'POST',
        body,
      });
      const data = await response.json() as ApplyEnvelope;
      if (!response.ok || !data.success || !data.data?.trackingCode) {
        setStatus(data.error?.message || 'Không thể nộp hồ sơ. Vui lòng thử lại.');
        return;
      }
      setReceipt({ code: data.data.trackingCode, emailSent: data.data.emailSent === true });
      setCv(null);
    } catch {
      setStatus('Không kết nối được máy chủ tuyển dụng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="s310-application" aria-labelledby="s310-application-title">
      {receipt ? (
        <div className="s403-application-receipt" role="status">
          <h2>Đã tiếp nhận hồ sơ ứng tuyển</h2>
          <p>Mã tra cứu hồ sơ của bạn:</p>
          <strong className="s403-application-code">{receipt.code}</strong>
          <p>{receipt.emailSent
            ? 'Email xác nhận đã được gửi. Vui lòng kiểm tra hộp thư và lưu mã tra cứu.'
            : 'Hồ sơ đã lưu nhưng email xác nhận chưa gửi được. Hãy lưu ngay mã tra cứu và liên hệ bộ phận tuyển dụng nếu cần.'}</p>
        </div>
      ) : <>
      <div className="s310-application-heading">
        <span className="s310-section-eyebrow">ỨNG TUYỂN</span>
        <h2 id="s310-application-title">Gửi hồ sơ ứng tuyển</h2>
        <p>Điền thông tin liên hệ và đính kèm CV để ứng tuyển vị trí này.</p>
      </div>

      <form className="s310-application-form" onSubmit={submitApplication} noValidate>
        <div className="s310-application-fields">
          <label className="s310-application-field">
            <span>Họ tên</span>
            <input
              autoComplete="name"
              name="fullName"
              value={fields.fullName}
              onChange={updateField}
              placeholder="Nhập họ và tên của bạn"
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? 's310-application-name-error' : undefined}
            />
            {errors.fullName && <span className="s310-application-field-error" id="s310-application-name-error">{errors.fullName}</span>}
          </label>

          <label className="s310-application-field">
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              type="email"
              value={fields.email}
              onChange={updateField}
              placeholder="name@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 's310-application-email-error' : undefined}
            />
            {errors.email && <span className="s310-application-field-error" id="s310-application-email-error">{errors.email}</span>}
          </label>

          <label className="s310-application-field">
            <span>Số điện thoại</span>
            <input
              autoComplete="tel"
              inputMode="tel"
              name="phone"
              type="tel"
              value={fields.phone}
              onChange={updateField}
              placeholder="Nhập số điện thoại liên hệ"
              aria-invalid={!!errors.phone}
            />
            {errors.phone && <span className="s310-application-field-error">{errors.phone}</span>}
          </label>

          <label className="s310-application-field">
            <span>Nguồn biết tin</span>
            <input
              name="source"
              value={fields.source}
              onChange={updateField}
              placeholder="Ví dụ: LinkedIn, Facebook, bạn bè..."
            />
          </label>

          <label className="s310-application-field s310-application-field-wide">
            <span>Thư giới thiệu</span>
            <textarea
              name="coverLetter"
              value={fields.coverLetter}
              onChange={updateField}
              placeholder="Giới thiệu ngắn về bản thân và lý do bạn phù hợp với vị trí này"
              rows={5}
            />
          </label>

          <div className="s310-application-field s310-application-field-wide">
            <span id="s310-application-cv-label">Tệp CV <span className="s310-application-required" aria-hidden="true">*</span></span>
            <div className={`s310-application-upload${errors.cv ? ' has-error' : ''}${isValidatingCv ? ' is-validating' : ''}`}>
              {cv ? (
                <div className="s310-application-file">
                  <span className="s310-application-file-name" title={cv.name}>{cv.name}</span>
                  <div className="s310-application-file-actions">
                    <button className="s310-application-secondary" type="button" onClick={() => fileInput.current?.click()}>Thay tệp</button>
                    <button className="s310-application-remove" type="button" onClick={clearCv} aria-label="Xóa tệp CV"><X size={18}/></button>
                  </div>
                </div>
              ) : isValidatingCv ? (
                <span className="s310-application-validation-status" role="status">Đang kiểm tra tệp CV…</span>
              ) : (
                <button className="s310-application-choose" type="button" onClick={() => fileInput.current?.click()}>
                  <Upload size={19}/>
                  <span>Chọn CV từ thiết bị</span>
                </button>
              )}
              <input
                ref={fileInput}
                className="s310-application-file-input"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={chooseCv}
                aria-labelledby="s310-application-cv-label"
                aria-invalid={!!errors.cv}
                aria-describedby={errors.cv ? 's310-application-cv-error' : 's310-application-cv-hint'}
              />
              <span className="s310-application-hint" id="s310-application-cv-hint">Chỉ nhận PDF hoặc DOCX · Tối đa 10 MB</span>
            </div>
            {errors.cv && <span className="s310-application-field-error" id="s310-application-cv-error">{errors.cv}</span>}
          </div>
        </div>

        <div className="s310-application-submit">
          {status && <p className="s310-application-status" role="alert">{status}</p>}
          <button className="s310-application-submit-button" type="submit" disabled={isValidatingCv || loading}>
            {loading ? 'Đang gửi hồ sơ…' : isValidatingCv ? 'Đang kiểm tra CV…' : 'Nộp hồ sơ'}
          </button>
        </div>
      </form>
      </>}
    </section>
  );
}
