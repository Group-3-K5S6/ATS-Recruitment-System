import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import './application-status-lookup.css';
import './job-posting-publish.css';
import './public-careers.css';

type LookupFields = {
  trackingCode: string;
  email: string;
};

type LookupErrors = Partial<Record<keyof LookupFields, string>>;

export default function ApplicationStatusLookup() {
  const [fields, setFields] = useState<LookupFields>({ trackingCode: '', email: '' });
  const [errors, setErrors] = useState<LookupErrors>({});
  const [message, setMessage] = useState('');

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: LookupErrors = {};
    if (!fields.trackingCode.trim()) {
      nextErrors.trackingCode = 'Vui lòng nhập mã tra cứu.';
    }
    if (!fields.email.trim()) {
      nextErrors.email = 'Vui lòng nhập email đã dùng khi nộp hồ sơ.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) {
      nextErrors.email = 'Vui lòng nhập địa chỉ email hợp lệ.';
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage('Vui lòng kiểm tra lại thông tin tra cứu.');
      return;
    }

    setMessage('Hiện chưa thể tra cứu vì chức năng chưa được kết nối với API tra cứu công khai.');
  }

  function updateField(field: keyof LookupFields, value: string) {
    setFields(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
    setMessage('');
  }

  return (
    <div className="s310-careers-page">
      <a className="s310-skip-link" href="#application-lookup-main">Bỏ qua điều hướng</a>
      <header className="s310-careers-header">
        <div className="s310-careers-header-inner">
          <Link to="/careers" className="s310-careers-brand" aria-label="ATS - Trang tuyển dụng">
            <span className="s310-brand-mark">A</span>
            <span className="s310-brand-words"><strong>ATS Careers</strong><small>Cơ hội nghề nghiệp</small></span>
          </Link>
          <nav aria-label="Điều hướng cổng tuyển dụng" className="s310-careers-topnav">
            <Link to="/careers">Vị trí tuyển dụng</Link>
            <Link to="/careers/tra-cuu" className="s310-topnav-lookup s310-lookup-nav-active" aria-current="page">Tra cứu hồ sơ</Link>
          </nav>
        </div>
      </header>

      <main id="application-lookup-main" className="s310-careers-main s310-lookup-main">
        <nav className="s310-careers-breadcrumb" aria-label="Đường dẫn">
          <Link to="/careers">Cơ hội nghề nghiệp</Link>
          <span aria-hidden="true">›</span>
          <span>Tra cứu hồ sơ</span>
        </nav>

        <section className="s310-lookup-card" aria-labelledby="s310-lookup-title">
          <div className="s310-lookup-icon" aria-hidden="true"><Search size={23}/></div>
          <span className="s310-section-eyebrow">DÀNH CHO ỨNG VIÊN</span>
          <h1 id="s310-lookup-title">Tra cứu trạng thái hồ sơ</h1>
          <p className="s310-lookup-description">Nhập mã tra cứu và email đã sử dụng khi nộp hồ sơ.</p>

          <form className="s310-lookup-form" onSubmit={submitLookup} noValidate>
            <label className="s310-lookup-field">
              <span>Mã tra cứu</span>
              <input
                autoComplete="off"
                name="trackingCode"
                value={fields.trackingCode}
                onChange={event => updateField('trackingCode', event.currentTarget.value)}
                placeholder="Nhập mã tra cứu hồ sơ"
                aria-invalid={!!errors.trackingCode}
                aria-describedby={errors.trackingCode ? 's310-lookup-code-error' : undefined}
              />
              {errors.trackingCode && <span className="s310-lookup-field-error" id="s310-lookup-code-error">{errors.trackingCode}</span>}
            </label>

            <label className="s310-lookup-field">
              <span>Email</span>
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                type="email"
                value={fields.email}
                onChange={event => updateField('email', event.currentTarget.value)}
                placeholder="name@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 's310-lookup-email-error' : undefined}
              />
              {errors.email && <span className="s310-lookup-field-error" id="s310-lookup-email-error">{errors.email}</span>}
            </label>

            {message && <p className="s310-lookup-message" role={Object.keys(errors).length ? 'alert' : 'status'}>{message}</p>}

            <button className="s310-lookup-submit" type="submit">
              <Search size={17}/>
              Tra cứu hồ sơ
            </button>
          </form>

          <Link className="s310-lookup-back" to="/careers"><ArrowLeft size={15}/> Quay lại tin tuyển dụng</Link>
        </section>
      </main>

      <footer className="s310-careers-footer">
        <div><strong>ATS Careers</strong><span>Thông tin tuyển dụng được cập nhật theo trạng thái xuất bản chính thức.</span></div>
        <span>© {new Date().getFullYear()} ATS</span>
      </footer>
    </div>
  );
}
