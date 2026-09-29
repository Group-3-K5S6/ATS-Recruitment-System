import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  BadgeCheck,
  Building2,
  Camera,
  CheckCircle2,
  LockKeyhole,
  LoaderCircle,
  Mail,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

type EditableProfile = {
  fullName: string;
  phone: string;
  jobTitle: string;
};

type ProfileErrors = Partial<Record<keyof EditableProfile, string>>;

const INITIAL_PROFILE: EditableProfile = {
  fullName: "Nguyễn Văn An",
  phone: "0912345678",
  jobTitle: "Chuyên viên tuyển dụng",
};

const PHONE_PATTERN = /^(03|05|07|08|09)\d{8}$/;

export default function UserProfilePage() {
  const [savedProfile, setSavedProfile] = useState(INITIAL_PROFILE);
  const [form, setForm] = useState(INITIAL_PROFILE);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (saveTimeoutRef.current !== null) window.clearTimeout(saveTimeoutRef.current);
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  const updateField = (field: keyof EditableProfile, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      if (field === "phone") {
        if (!value.trim()) next.phone = "Vui lòng nhập số điện thoại.";
        else if (!PHONE_PATTERN.test(value.trim())) next.phone = "Nhập số di động Việt Nam gồm 10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.";
        else delete next.phone;
      } else if (value.trim()) {
        delete next[field];
      }
      return next;
    });
  };

  const validate = (): ProfileErrors => {
    const next: ProfileErrors = {};
    if (!form.fullName.trim()) next.fullName = "Vui lòng nhập họ và tên.";
    if (!form.phone.trim()) next.phone = "Vui lòng nhập số điện thoại.";
    else if (!PHONE_PATTERN.test(form.phone.trim())) next.phone = "Số điện thoại chưa đúng định dạng Việt Nam.";
    if (!form.jobTitle.trim()) next.jobTitle = "Vui lòng nhập chức danh hiển thị.";
    return next;
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      if (nextErrors.fullName) nameInputRef.current?.focus();
      else if (nextErrors.phone) phoneInputRef.current?.focus();
      else titleInputRef.current?.focus();
      return;
    }

    setIsSaving(true);
    setToast("");
    saveTimeoutRef.current = window.setTimeout(() => {
      const updated = {
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        jobTitle: form.jobTitle.trim(),
      };
      setSavedProfile(updated);
      setForm(updated);
      setErrors({});
      setIsSaving(false);
      setToast("Đã cập nhật thông tin cá nhân!");
      toastTimeoutRef.current = window.setTimeout(() => setToast(""), 4200);
    }, 500);
  };

  const handleCancel = () => {
    setForm(savedProfile);
    setErrors({});
    setToast("");
  };

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setAvatar(reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const initials = savedProfile.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <main className="user-profile-page">
      <div className="profile-page-heading">
        <div>
          <p className="profile-eyebrow">TÀI KHOẢN CỦA TÔI</p>
          <h1>Hồ sơ cá nhân</h1>
          <p className="profile-heading-copy">Quản lý thông tin hiển thị và thông tin liên hệ của bạn.</p>
        </div>
        <span className="profile-verified"><BadgeCheck size={16} /> Hồ sơ nội bộ</span>
      </div>

      <form className="profile-card" onSubmit={handleSave} noValidate>
        <section aria-label="Ảnh đại diện" className="profile-identity">
          <div className="profile-avatar-wrap">
            <div className="profile-avatar">
              {avatar ? <img alt="Ảnh đại diện" src={avatar} /> : <span>{initials || <UserRound size={40} />}</span>}
            </div>
            <input accept="image/*" className="profile-avatar-input" onChange={handleAvatarChange} ref={avatarInputRef} type="file" />
            <button
              aria-label="Thay đổi ảnh đại diện"
              className="profile-avatar-edit"
              onClick={() => avatarInputRef.current?.click()}
              title="Thay đổi ảnh đại diện"
              type="button"
            >
              <Camera size={15} />
            </button>
          </div>
          <div className="profile-identity-copy">
            <h2>{form.fullName || "Họ và tên"}</h2>
            <p>{form.jobTitle || "Chức danh"}</p>
            <span><span className="profile-active-dot" /> Đang hoạt động</span>
          </div>
          <div className="profile-identity-note">
            <ShieldCheck size={17} />
            <span>Thông tin hồ sơ chỉ hiển thị trong hệ thống nội bộ.</span>
          </div>
        </section>

        <div className="profile-form-content">
          <div className="profile-section-heading">
            <div>
              <h2>Thông tin cá nhân</h2>
              <p>Cập nhật các thông tin bạn có thể chỉnh sửa.</p>
            </div>
            <span className="profile-required-note"><i /> Trường bắt buộc</span>
          </div>

          <div className="profile-fields-grid">
            <label className="profile-field" htmlFor="profile-full-name">
              <span className="profile-label">Họ và tên <i>*</i></span>
              <span className={`profile-input-wrap${errors.fullName ? " has-error" : ""}`}>
                <UserRound size={17} />
                <input
                  aria-describedby={errors.fullName ? "profile-name-error" : undefined}
                  aria-invalid={Boolean(errors.fullName)}
                  id="profile-full-name"
                  onChange={(event) => updateField("fullName", event.target.value)}
                  ref={nameInputRef}
                  type="text"
                  value={form.fullName}
                />
              </span>
              {errors.fullName && <span className="profile-error" id="profile-name-error" role="alert">{errors.fullName}</span>}
            </label>

            <label className="profile-field" htmlFor="profile-phone">
              <span className="profile-label">Số điện thoại <i>*</i></span>
              <span className={`profile-input-wrap${errors.phone ? " has-error" : ""}`}>
                <Phone size={17} />
                <input
                  aria-describedby={errors.phone ? "profile-phone-error" : "profile-phone-hint"}
                  aria-invalid={Boolean(errors.phone)}
                  autoComplete="tel"
                  id="profile-phone"
                  inputMode="tel"
                  maxLength={10}
                  onChange={(event) => updateField("phone", event.target.value.replace(/\D/g, ""))}
                  ref={phoneInputRef}
                  type="tel"
                  value={form.phone}
                />
              </span>
              {errors.phone ? <span className="profile-error" id="profile-phone-error" role="alert">{errors.phone}</span> : <span className="profile-field-hint" id="profile-phone-hint">10 chữ số, bắt đầu bằng 03, 05, 07, 08 hoặc 09.</span>}
            </label>

            <label className="profile-field profile-field-wide" htmlFor="profile-job-title">
              <span className="profile-label">Chức danh hiển thị <i>*</i></span>
              <span className={`profile-input-wrap${errors.jobTitle ? " has-error" : ""}`}>
                <Building2 size={17} />
                <input
                  aria-describedby={errors.jobTitle ? "profile-title-error" : undefined}
                  aria-invalid={Boolean(errors.jobTitle)}
                  id="profile-job-title"
                  onChange={(event) => updateField("jobTitle", event.target.value)}
                  ref={titleInputRef}
                  type="text"
                  value={form.jobTitle}
                />
              </span>
              {errors.jobTitle && <span className="profile-error" id="profile-title-error" role="alert">{errors.jobTitle}</span>}
            </label>
          </div>

          <div className="profile-section-heading system-section-heading">
            <div>
              <h2>Thông tin hệ thống</h2>
              <p>Các thông tin này do Quản trị viên quản lý.</p>
            </div>
            <span className="profile-locked-label"><LockKeyhole size={13} /> Đã khóa</span>
          </div>

          <div className="profile-fields-grid system-fields-grid">
            <LockedField icon={<Mail size={16} />} label="Email công ty" value="an.nguyen@ats.vn" />
            <LockedField icon={<Building2 size={16} />} label="Phòng ban" value="Nhân sự" />
            <LockedField icon={<ShieldCheck size={16} />} label="Vai trò / Phân quyền" value="Quản trị hệ thống" />
          </div>

          <div className="profile-form-footer">
            <span className="profile-footer-message">Thay đổi chỉ được lưu trên phiên làm việc hiện tại.</span>
            <div className="profile-actions">
              <button className="profile-cancel-button" disabled={isSaving} onClick={handleCancel} type="button"><X size={16} /> Hủy bỏ</button>
              <button className="profile-save-button" disabled={isSaving} type="submit">
                {isSaving ? <><LoaderCircle className="profile-spinner" size={17} /> Đang lưu...</> : <><Save size={16} /> Lưu thay đổi</>}
              </button>
            </div>
          </div>
        </div>
      </form>

      {toast && <div aria-live="polite" className="profile-toast" role="status"><CheckCircle2 size={19} /><span>{toast}</span><button aria-label="Đóng thông báo" onClick={() => setToast("")} type="button"><X size={15} /></button></div>}

      <style>{`
        .user-profile-page{--profile-ink:#24332d;--profile-muted:#76837d;--profile-line:#e3eae6;--profile-green:#247454;--profile-soft:#f4f8f5;max-width:1120px;margin:0 auto;padding:8px 0 36px;color:var(--profile-ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .profile-page-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:4px 0 23px}.profile-eyebrow{margin:0 0 7px;color:#688278;font-size:10px;font-weight:750;letter-spacing:1px}.profile-page-heading h1{margin:0;color:#20312a;font-size:26px;font-weight:690;line-height:1.25}.profile-heading-copy{margin:7px 0 0;color:var(--profile-muted);font-size:13px;line-height:1.5}.profile-verified{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border:1px solid #dcebe2;border-radius:6px;background:#f4faf6;color:#37805b;font-size:10px;font-weight:650;white-space:nowrap}
        .profile-card{display:grid;grid-template-columns:290px minmax(0,1fr);overflow:hidden;border:1px solid var(--profile-line);border-radius:9px;background:#fff;box-shadow:0 4px 18px rgba(37,61,49,.045)}
        .profile-identity{display:flex;flex-direction:column;align-items:center;padding:34px 25px 25px;border-right:1px solid var(--profile-line);background:linear-gradient(180deg,#f7faf8 0%,#f2f7f4 100%)}.profile-avatar-wrap{position:relative;margin-bottom:15px}.profile-avatar{display:grid;width:112px;height:112px;overflow:hidden;place-items:center;border:4px solid #fff;border-radius:50%;background:linear-gradient(145deg,#2e8064,#175741);box-shadow:0 3px 12px rgba(35,87,64,.17);color:#fff}.profile-avatar span{font-size:31px;font-weight:650}.profile-avatar img{width:100%;height:100%;object-fit:cover}.profile-avatar-input{display:none}.profile-avatar-edit{position:absolute;right:0;bottom:1px;display:grid;width:33px;height:33px;place-items:center;border:3px solid #f5f9f6;border-radius:50%;background:#fff;color:#2e7257;cursor:pointer;box-shadow:0 2px 7px rgba(35,60,47,.13)}.profile-avatar-edit:hover{background:#e8f3ec}.profile-identity-copy{text-align:center}.profile-identity-copy h2{margin:0;color:#26362f;font-size:17px;font-weight:680}.profile-identity-copy p{margin:5px 0 10px;color:#65756d;font-size:12px}.profile-identity-copy>span{display:inline-flex;align-items:center;gap:6px;color:#55806a;font-size:10px}.profile-active-dot{width:7px;height:7px;border-radius:50%;background:#45a56c;box-shadow:0 0 0 3px #e0f1e6}.profile-identity-note{display:flex;align-items:flex-start;gap:8px;margin-top:auto;padding:15px 0 0;color:#77867f;font-size:10px;line-height:1.6}.profile-identity-note svg{flex:0 0 auto;color:#6d9a7f}
        .profile-form-content{min-width:0;padding:27px 31px 0}.profile-section-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:17px}.profile-section-heading h2{margin:0;color:#2c3933;font-size:14px;font-weight:690}.profile-section-heading p{margin:5px 0 0;color:#829089;font-size:11px}.profile-required-note{display:inline-flex;align-items:center;gap:6px;color:#89948f;font-size:10px;white-space:nowrap}.profile-required-note i,.profile-label i{color:#c05d51;font-style:normal}.profile-fields-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px 20px}.profile-field{display:flex;min-width:0;flex-direction:column;gap:7px}.profile-field-wide{grid-column:1/-1}.profile-label{color:#485750;font-size:11px;font-weight:650}.profile-input-wrap{display:flex;align-items:center;gap:10px;height:42px;padding:0 12px;border:1px solid #dce4df;border-radius:6px;background:#fff;color:#88968f;transition:border-color .15s,box-shadow .15s}.profile-input-wrap:focus-within{border-color:#67a286;box-shadow:0 0 0 3px rgba(51,132,94,.1)}.profile-input-wrap.has-error{border-color:#d97b70;background:#fffafa}.profile-input-wrap.has-error:focus-within{box-shadow:0 0 0 3px rgba(195,83,70,.1)}.profile-input-wrap svg{flex:0 0 auto}.profile-input-wrap input{width:100%;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#2e3b35;font:inherit;font-size:12px}.profile-input-wrap input::placeholder{color:#a3ada8}.profile-error{color:#b64e44;font-size:10px;line-height:1.45}.profile-field-hint{color:#87938d;font-size:10px;line-height:1.45}
        .system-section-heading{margin:27px 0 14px;padding-top:20px;border-top:1px solid #edf0ee}.profile-locked-label{display:inline-flex;align-items:center;gap:5px;color:#8b9691;font-size:10px}.system-fields-grid{gap:12px}.profile-locked-field{display:flex;min-width:0;flex-direction:column;gap:7px}.profile-locked-field .profile-label{display:flex;align-items:center;gap:6px}.profile-locked-field .profile-label svg{color:#8b9691}.profile-locked-value{display:flex;align-items:center;gap:9px;min-width:0;height:40px;padding:0 11px;border:1px solid #e7ebe9;border-radius:6px;background:#f3f5f4;color:#77817c}.profile-locked-value span{overflow:hidden;color:#78837d;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.profile-lock-icon{margin-left:auto;flex:0 0 auto;color:#9ba59f}.profile-locked-help{margin:0;color:#929c97;font-size:9px;line-height:1.45}
        .profile-form-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:24px -31px 0;padding:15px 31px;border-top:1px solid #e9eeeb;background:#fbfcfb}.profile-footer-message{color:#87928d;font-size:10px;line-height:1.5}.profile-actions{display:flex;justify-content:flex-end;gap:8px}.profile-cancel-button,.profile-save-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 13px;border:1px solid #dce4df;border-radius:6px;background:#fff;color:#536159;font:inherit;font-size:11px;font-weight:650;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.profile-cancel-button:hover:not(:disabled){border-color:#bac9c1;background:#f6f9f7}.profile-save-button{border-color:#267553;background:#267553;color:#fff}.profile-save-button:hover:not(:disabled){transform:translateY(-1px);border-color:#1d6548;background:#1d6548}.profile-save-button:disabled,.profile-cancel-button:disabled{cursor:wait;opacity:.65}.profile-spinner{animation:profile-spin .8s linear infinite}.profile-toast{position:fixed;right:25px;bottom:25px;z-index:1200;display:flex;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 32px));padding:13px 15px;border:1px solid #cfe6d6;border-radius:7px;background:#f0faf3;box-shadow:0 8px 26px rgba(29,75,48,.14);color:#286d44;font-size:12px;font-weight:600;animation:profile-toast-in .2s ease-out both}.profile-toast>svg{flex:0 0 auto}.profile-toast button{display:grid;width:24px;height:24px;margin-left:5px;place-items:center;border:0;border-radius:4px;background:transparent;color:#5d8d6d;cursor:pointer}.profile-toast button:hover{background:#e1f2e6}
        @keyframes profile-spin{to{transform:rotate(360deg)}}@keyframes profile-toast-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:850px){.profile-card{grid-template-columns:220px minmax(0,1fr)}.profile-identity{padding-inline:18px}.profile-form-content{padding-inline:22px}.profile-form-footer{margin-inline:-22px;padding-inline:22px}}
        @media(max-width:650px){.user-profile-page{padding-top:0}.profile-page-heading{align-items:flex-start;margin-bottom:17px}.profile-page-heading h1{font-size:22px}.profile-heading-copy{max-width:280px;font-size:12px}.profile-card{grid-template-columns:minmax(0,1fr)}.profile-identity{display:grid;grid-template-columns:78px minmax(0,1fr);justify-items:start;column-gap:14px;padding:18px;border-right:0;border-bottom:1px solid var(--profile-line)}.profile-avatar-wrap{grid-row:span 2;margin:0}.profile-avatar{width:72px;height:72px;border-width:3px}.profile-avatar span{font-size:22px}.profile-avatar-edit{width:27px;height:27px;border-width:2px}.profile-identity-copy{text-align:left;align-self:end}.profile-identity-copy h2{font-size:15px}.profile-identity-copy p{margin:4px 0 7px}.profile-identity-copy>span{font-size:9px}.profile-identity-note{grid-column:1/-1;margin-top:13px;padding:0}.profile-form-content{padding:20px 17px 0}.profile-fields-grid{grid-template-columns:minmax(0,1fr);gap:14px}.profile-field-wide{grid-column:auto}.system-section-heading{margin-top:22px;padding-top:17px}.system-fields-grid{gap:12px}.profile-form-footer{align-items:stretch;flex-direction:column-reverse;margin:21px -17px 0;padding:13px 17px}.profile-actions{width:100%}.profile-actions button{flex:1}.profile-footer-message{font-size:9px}.profile-toast{right:12px;bottom:12px}}
        @media(prefers-reduced-motion:reduce){.profile-spinner,.profile-toast{animation-duration:.01ms}.profile-input-wrap,.profile-save-button{transition-duration:.01ms}}
      `}</style>
    </main>
  );
}

type LockedFieldProps = { icon: React.ReactNode; label: string; value: string };

function LockedField({ icon, label, value }: LockedFieldProps) {
  return (
    <div className="profile-locked-field">
      <span className="profile-label">{icon}{label}</span>
      <div aria-readonly="true" className="profile-locked-value">
        {icon}
        <span>{value}</span>
        <LockKeyhole aria-label="Đã khóa" className="profile-lock-icon" size={14} />
      </div>
      <p className="profile-locked-help">Vui lòng liên hệ Quản trị viên để thay đổi thông tin này</p>
    </div>
  );
}