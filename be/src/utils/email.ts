import nodemailer from 'nodemailer';
import { env } from '../config/env';

export const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,

  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendResetPasswordEmail(
  toEmail: string,
  resetToken: string
): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP chưa được cấu hình.');
  }

  const resetLink =
    `${env.FRONTEND_URL}/reset-password` +
    `?token=${encodeURIComponent(resetToken)}`;

  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'ATS - Đặt lại mật khẩu',

    text: `
Bạn vừa yêu cầu đặt lại mật khẩu ATS.

Mở liên kết sau:
${resetLink}

Liên kết có hiệu lực trong 30 phút và chỉ sử dụng được một lần.

Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Đặt lại mật khẩu ATS</h2>

        <p>
          Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản ATS.
        </p>

        <p>
          <a
            href="${resetLink}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #1f2937;
              color: white;
              text-decoration: none;
              border-radius: 6px;
            "
          >
            Đặt lại mật khẩu
          </a>
        </p>

        <p>
          Liên kết có hiệu lực trong
          <strong>30 phút</strong>
          và chỉ được sử dụng
          <strong>một lần</strong>.
        </p>

        <p>
          Nếu bạn không yêu cầu thao tác này,
          hãy bỏ qua email.
        </p>
      </div>
    `,
  });
}
export async function sendAccountActivationEmail(
  toEmail: string,
  fullName: string,
  temporaryPassword: string
): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP chưa được cấu hình.');
  }

  const loginLink = `${env.FRONTEND_URL}/login`;

  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'ATS - Tài khoản của bạn đã được tạo',

    text: `
Xin chào ${fullName},

Tài khoản ATS của bạn đã được Quản trị viên tạo.

Email đăng nhập: ${toEmail}
Mật khẩu tạm thời: ${temporaryPassword}

Đăng nhập tại:
${loginLink}

Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu.

Không chia sẻ mật khẩu này cho người khác.
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Tài khoản ATS đã được tạo</h2>

        <p>Xin chào <strong>${fullName}</strong>,</p>

        <p>
          Quản trị viên đã tạo tài khoản ATS cho bạn.
        </p>

        <p>
          <strong>Email đăng nhập:</strong> ${toEmail}
        </p>

        <p>
          <strong>Mật khẩu tạm thời:</strong>
          <code
            style="
              padding: 4px 8px;
              background: #f3f4f6;
              border-radius: 4px;
            "
          >
            ${temporaryPassword}
          </code>
        </p>

        <p>
          <a
            href="${loginLink}"
            style="
              display: inline-block;
              padding: 12px 20px;
              background: #1f2937;
              color: white;
              text-decoration: none;
              border-radius: 6px;
            "
          >
            Đăng nhập ATS
          </a>
        </p>

        <p>
          Vui lòng đổi mật khẩu sau khi đăng nhập lần đầu.
        </p>

        <p>
          Không chia sẻ mật khẩu này cho người khác.
        </p>
      </div>
    `,
  });
}

/**
 * Send candidate application tracking code via email upon successful application creation.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[char];
  });
}
export async function sendApplicationTrackingEmail(
  toEmail: string,
  candidateName: string,
  trackingCode: string,
  jobTitle?: string
): Promise<void> {
  // If SMTP credentials not configured (e.g. dev environment without SMTP), safely return
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    return;
  }
  const safeCandidateName = escapeHtml(candidateName);
  const safeJobTitle = jobTitle ? escapeHtml(jobTitle) : undefined;
  const safeTrackingCode = escapeHtml(trackingCode);

  const trackLink = `${env.FRONTEND_URL}/candidate/track-status?code=${encodeURIComponent(trackingCode)}&email=${encodeURIComponent(toEmail)}`;

  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: `ATS - Tiếp nhận hồ sơ ứng tuyển${jobTitle ? ` - ${jobTitle}` : ''}`,
    text: `
Xin chào ${candidateName},

Hồ sơ ứng tuyển của bạn đã được tiếp nhận thành công vào hệ thống tuyển dụng ATS.

Mã tra cứu hồ sơ: ${trackingCode}
Email tra cứu: ${toEmail}
${jobTitle ? `Vị trí ứng tuyển: ${jobTitle}` : ''}

Bạn có thể theo dõi tiến độ xử lý hồ sơ bất kỳ lúc nào tại:
${trackLink}

Lưu ý: Vui lòng bảo mật mã tra cứu này.
Trân trọng,
Đội ngũ Tuyển dụng ATS
    `.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1f2937;">Tiếp nhận hồ sơ ứng tuyển</h2>
        <p>Xin chào <strong>${candidateName}</strong>,</p>
        <p>Hồ sơ ứng tuyển của bạn đã được tiếp nhận thành công vào hệ thống tuyển dụng ATS.</p>
        ${jobTitle ? `<p><strong>Vị trí ứng tuyển:</strong> ${jobTitle}</p>` : ''}
        <div style="margin: 20px 0; padding: 16px; background-color: #f3f4f6; border-radius: 6px; text-align: center;">
          <p style="margin: 0; font-size: 14px; color: #4b5563;">Mã tra cứu hồ sơ của bạn:</p>
          <p style="margin: 8px 0 0; font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #111827;">${trackingCode}</p>
        </div>
        <p>Bạn có thể theo dõi tiến độ xử lý hồ sơ bất kỳ lúc nào tại:</p>
        <p>
          <a href="${trackLink}" style="display: inline-block; padding: 12px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Tra cứu trạng thái hồ sơ
          </a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="font-size: 12px; color: #6b7280;">Vui lòng lưu giữ mã tra cứu này. Đây là email tự động từ hệ thống ATS, vui lòng không trả lời thư này.</p>
      </div>
    `,
  });
}
