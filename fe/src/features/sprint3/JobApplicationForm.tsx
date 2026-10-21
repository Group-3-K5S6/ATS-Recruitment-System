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

export default function JobApplicationForm() {
  const [fields, setFields] = useState<ApplicationFields>(emptyFields);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
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

  function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: FieldErrors = {};
    if (fields.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      nextErrors.email = 'Vui lòng nhập địa chỉ email hợp lệ.';
    }
    if (isValidatingCv) {
      setStatus('Vui lòng đợi kiểm tra tệp CV hoàn tất.');
      return;
    }
    if (!cv) {
      nextErrors.cv = errors.cv || 'Vui lòng đính kèm CV định dạng PDF hoặc DOCX, tối đa 10 MB.';
    }
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setStatus('Vui lòng kiểm tra lại các thông tin được đánh dấu.');
      return;
    }

    setStatus(
      'Thông tin chưa được gửi đi. Backend chưa cung cấp API ứng tuyển công khai cho vị trí này. Dữ liệu biểu mẫu chỉ được giữ trên trang này.',
    );
  }

  return (
    <section className="s310-application" aria-labelledby="s310-application-title">
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
            />
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
          <button className="s310-application-submit-button" type="submit" disabled={isValidatingCv}>
            {isValidatingCv ? 'Đang kiểm tra CV…' : 'Nộp hồ sơ'}
          </button>
          <p className="s310-application-api-note">Hồ sơ chưa thể gửi cho đến khi Backend cung cấp API ứng tuyển công khai.</p>
        </div>
      </form>
    </section>
  );
}
