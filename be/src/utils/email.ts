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