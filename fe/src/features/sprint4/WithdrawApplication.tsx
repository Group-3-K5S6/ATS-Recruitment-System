import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, FileX2, Mail, ShieldCheck, X } from 'lucide-react';
import '../sprint3/public-careers.css';
import './withdraw-application.css';

type Preview = {
  candidateName: string;
  jobTitle: string;
  requiresConfirmation: boolean;
};

type ApiResult<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
};

type PreviewState = 'loading' | 'valid' | 'invalid';

export default function WithdrawApplication() {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim() || '';
  const code = params.get('code')?.trim() || '';
  const apiBase = String(import.meta.env.VITE_ATS_API_URL || '').replace(/\/+$/, '');

  const [trackingCode, setTrackingCode] = useState(code);
  const [email, setEmail] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>('loading');
  const [agreed, setAgreed] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    async function loadPreview() {
      try {
        const response = await fetch(
          `${apiBase}/api/applications/withdrawal-confirmation?token=${encodeURIComponent(token)}`,
          { signal: controller.signal }
        );

        const result = await response.json() as ApiResult<Preview>;

        if (!response.ok || !result.success || !result.data?.requiresConfirmation) {
          setPreviewState('invalid');
          return;
        }

        setPreview(result.data);
        setPreviewState('valid');
      } catch {
        if (!controller.signal.aborted) setPreviewState('invalid');
      }
    }

    void loadPreview();
    return () => controller.abort();
  }, [token, apiBase]);

  async function requestWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!trackingCode.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Vui lòng nhập mã hồ sơ và địa chỉ email hợp lệ.');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch(`${apiBase}/api/applications/withdrawal-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackingCode: trackingCode.trim(),
          email: email.trim().toLowerCase(),
        }),
      });

      const result = await response.json() as ApiResult<unknown>;

      if (!response.ok) {
        setError(result.error?.message || 'Không thể xử lý yêu cầu lúc này.');
        return;
      }

      setMessage(
        'Nếu hồ sơ còn hoạt động và thông tin khớp, chúng tôi sẽ gửi liên kết xác nhận đến email đã đăng ký.'
      );
    } catch {
      setError('Không thể kết nối đến hệ thống. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmWithdrawal() {
    if (!token || !preview || !agreed || busy) return;

    setError('');
    setBusy(true);

    try {
      const response = await fetch(`${apiBase}/api/applications/withdrawal-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const result = await response.json() as ApiResult<{ status: string }>;

      if (!response.ok || !result.success || result.data?.status !== 'WITHDRAWN') {
        setError(result.error?.message || 'Không thể rút hồ sơ. Vui lòng kiểm tra liên kết.');
        return;
      }

      setDone(true);
    } catch {
      setError('Không thể kết nối đến hệ thống. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="s310-careers-page">
      <header className="s310-careers-header">
        <div className="s310-careers-header-inner">
          <Link className="s310-careers-brand" to="/careers">
            <span className="s310-brand-mark">A</span>
            <span className="s310-brand-words">
              <strong>ATS Careers</strong>
              <small>Cơ hội nghề nghiệp</small>
            </span>
          </Link>
        </div>
      </header>

      <main className="s310-careers-main s406-main">
        <Link className="s406-back" to="/careers">
          <ArrowLeft size={16} /> Quay lại trang tuyển dụng
        </Link>

        {!isFormOpen && (
          <div className="s406-entry">
            <div className="s406-icon">
              <FileX2 size={25} />
            </div>

            <span className="s406-eyebrow">
              DÀNH CHO ỨNG VIÊN
            </span>

            <h1>Quản lý hồ sơ ứng tuyển</h1>

            <p>
              Bạn có thể yêu cầu rút hồ sơ nếu không còn
              nhu cầu ứng tuyển vị trí đã đăng ký.
            </p>

            <button
              type="button"
              className="s406-open-button"
              onClick={() => setIsFormOpen(true)}
            >
              <FileX2 size={19} />
              Rút hồ sơ ứng tuyển
            </button>
          </div>
        )}

        {isFormOpen && (
          <div className="s406-overlay">
            <div
              className="s406-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="s406-title"
            >
              <button
                type="button"
                className="s406-close-button"
                aria-label="Đóng hộp thoại"
                onClick={() => setIsFormOpen(false)}
              >
                <X size={20} />
              </button>

              <section className="s406-card" aria-labelledby="s406-title">
          <div className="s406-icon"><FileX2 size={25} /></div>
          <span className="s406-eyebrow">DÀNH CHO ỨNG VIÊN</span>
          <h1 id="s406-title">Rút hồ sơ ứng tuyển</h1>

          {done ? (
            <div className="s406-success" role="status">
              <CheckCircle2 size={28} />
              <h2>Đã rút hồ sơ thành công</h2>
              <p>Hồ sơ của bạn đã được chuyển sang trạng thái Ứng viên rút.</p>
              <Link to="/careers">Về trang tuyển dụng</Link>
            </div>
          ) : token ? (
            <>
              {previewState === 'loading' && <p>Đang kiểm tra liên kết xác nhận...</p>}

              {previewState === 'invalid' && (
                <div className="s406-error" role="alert">
                  Liên kết không hợp lệ, đã hết hạn hoặc đã được sử dụng.
                </div>
              )}

              {previewState === 'valid' && preview && (
                <>
                  <p className="s406-description">
                    Vui lòng kiểm tra thông tin và xác nhận trước khi rút hồ sơ.
                  </p>

                  <div className="s406-preview">
                    <p><strong>Ứng viên:</strong> {preview.candidateName}</p>
                    <p><strong>Vị trí ứng tuyển:</strong> {preview.jobTitle}</p>
                  </div>

                  <div className="s406-warning" role="note">
                    Sau khi xác nhận, hồ sơ sẽ không còn trong danh sách đang tuyển.
                  </div>

                  <label className="s406-confirm-checkbox">
                    <input
                      type="checkbox"
                      checked={agreed}
                      onChange={(event) => setAgreed(event.currentTarget.checked)}
                    />
                    Tôi xác nhận muốn rút hồ sơ ứng tuyển này.
                  </label>

                  {error && <p className="s406-error" role="alert">{error}</p>}

                  <button
                    type="button"
                    className="s406-danger-button"
                    disabled={!agreed || busy}
                    onClick={() => { void confirmWithdrawal(); }}
                  >
                    {busy ? 'Đang xử lý...' : 'Xác nhận rút hồ sơ'}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <p className="s406-description">
                Nhập mã tra cứu và email đã dùng khi ứng tuyển để yêu cầu
                liên kết xác nhận rút hồ sơ.
              </p>

              <form className="s406-form" onSubmit={(event) => { void requestWithdrawal(event); }}>
                <label>
                  Mã tra cứu
                  <input
                    value={trackingCode}
                    onChange={(event) => setTrackingCode(event.currentTarget.value)}
                    placeholder="ATS-2026-XXXXXX"
                    required
                  />
                </label>

                <label>
                  Địa chỉ email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    placeholder="name@example.com"
                    required
                  />
                </label>

                {error && <p className="s406-error" role="alert">{error}</p>}
                {message && <p className="s406-info" role="status">{message}</p>}

                <button type="submit" className="s406-primary-button" disabled={busy}>
                  <Mail size={17} />
                  {busy ? 'Đang gửi...' : 'Gửi liên kết xác nhận'}
                </button>
              </form>
            </>
          )}

          <p className="s406-security">
            <ShieldCheck size={16} />
            Hồ sơ chỉ được rút sau khi xác nhận qua liên kết email.
          </p>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}