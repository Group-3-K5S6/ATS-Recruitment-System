import { useState } from 'react';
import { FileX2, Mail, X } from 'lucide-react';
import './withdraw-lookup-action.css';

type Props = {
  trackingCode: string;
  email: string;
};

export default function WithdrawLookupAction({ trackingCode, email }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function requestWithdrawal() {
    if (busy || sent) return;

    setBusy(true);
    setError('');

    const apiBase = String(
      import.meta.env.VITE_ATS_API_URL || ''
    ).replace(/\/+$/, '');

    try {
      const response = await fetch(
        `${apiBase}/api/applications/withdrawal-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingCode, email }),
        }
      );

      if (!response.ok) {
        setError('Chưa gửi được liên kết xác nhận. Vui lòng thử lại.');
        return;
      }

      setSent(true);
    } catch {
      setError('Không thể kết nối hệ thống. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="s406-lookup-action">
      <p>Không còn nhu cầu ứng tuyển vị trí này?</p>

      <button
        type="button"
        className="s406-lookup-trigger"
        onClick={() => setOpen(true)}
      >
        <FileX2 size={17} />
        Rút hồ sơ ứng tuyển
      </button>

      {open && (
        <div className="s406-lookup-overlay">
          <section
            className="s406-lookup-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s406-lookup-title"
          >
            <button
              type="button"
              className="s406-lookup-close"
              aria-label="Đóng hộp thoại"
              onClick={() => setOpen(false)}
            >
              <X size={20} />
            </button>

            <FileX2 size={28} className="s406-lookup-icon" />

            <h2 id="s406-lookup-title">
              Rút hồ sơ ứng tuyển
            </h2>

            <p>Mã hồ sơ:</p>
            <strong className="s406-lookup-code">{trackingCode}</strong>

            <p>
              Hệ thống sẽ gửi liên kết xác nhận tới email
              đã đăng ký. Hồ sơ chỉ được rút sau khi bạn
              xác nhận qua liên kết đó.
            </p>

            {error && (
              <p className="s406-lookup-error" role="alert">
                {error}
              </p>
            )}

            {sent && (
              <p className="s406-lookup-success" role="status">
                Nếu hồ sơ còn hoạt động, liên kết xác nhận
                sẽ được gửi đến email đã đăng ký.
              </p>
            )}

            <div className="s406-lookup-buttons">
              <button
                type="button"
                className="s406-lookup-cancel"
                onClick={() => setOpen(false)}
              >
                Đóng
              </button>

              <button
                type="button"
                className="s406-lookup-send"
                disabled={busy || sent}
                onClick={() => { void requestWithdrawal(); }}
              >
                <Mail size={16} />
                {busy ? 'Đang gửi...' : 'Gửi liên kết xác nhận'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}