import nodemailer from 'nodemailer';
import { env } from '../config/env';

const transporter = nodemailer.createTransport({
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

export async function sendApplicationWithdrawalConfirmationEmail(
  toEmail: string,
  candidateName: string,
  jobTitle: string,
  token: string
): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP chưa được cấu hình.');
  }

  const confirmationLink = `${env.FRONTEND_URL}/withdraw-application?token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'ATS - Xác nhận rút hồ sơ ứng tuyển',
    text: `Xin chào ${candidateName},\n\nBạn vừa yêu cầu rút hồ sơ ứng tuyển vị trí ${jobTitle}. Để xác nhận và hoàn tất việc rút hồ sơ, mở liên kết sau:\n${confirmationLink}\n\nLiên kết có hiệu lực trong 30 phút và chỉ sử dụng một lần. Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Xác nhận rút hồ sơ ứng tuyển</h2><p>Xin chào ${escapeHtml(candidateName)},</p><p>Bạn vừa yêu cầu rút hồ sơ ứng tuyển vị trí <strong>${escapeHtml(jobTitle)}</strong>.</p><p>Nhấn nút bên dưới để xác nhận và hoàn tất việc rút hồ sơ:</p><p><a href="${confirmationLink}" style="display:inline-block;padding:12px 20px;background:#1f2937;color:white;text-decoration:none;border-radius:6px">Xác nhận rút hồ sơ</a></p><p>Liên kết có hiệu lực trong <strong>30 phút</strong> và chỉ sử dụng được <strong>một lần</strong>.</p><p>Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email.</p></div>`,
  });
}

export async function sendApplicationWithdrawalNoticeEmail(
  toEmail: string,
  recruiterName: string,
  candidateName: string,
  jobTitle: string
): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP chưa được cấu hình.');
  }

  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: `ATS - Ứng viên đã rút hồ sơ: ${jobTitle}`,
    text: `Xin chào ${recruiterName},\n\nỨng viên ${candidateName} đã xác nhận rút hồ sơ ứng tuyển vị trí ${jobTitle}. Hồ sơ đã được chuyển sang trạng thái WITHDRAWN và không còn trong pipeline đang hoạt động.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Ứng viên đã rút hồ sơ</h2><p>Xin chào ${escapeHtml(recruiterName)},</p><p>Ứng viên <strong>${escapeHtml(candidateName)}</strong> đã xác nhận rút hồ sơ ứng tuyển vị trí <strong>${escapeHtml(jobTitle)}</strong>.</p><p>Hồ sơ đã chuyển sang trạng thái <strong>WITHDRAWN</strong> và không còn trong pipeline đang hoạt động.</p></div>`,
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
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
