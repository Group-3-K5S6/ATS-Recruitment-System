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

  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'ATS - Mã OTP đặt lại mật khẩu',

    text: `
Bạn vừa yêu cầu đặt lại mật khẩu ATS.

Mã OTP của bạn: ${resetToken}

Mã có hiệu lực trong 10 phút và chỉ sử dụng được một lần.

Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.
    `.trim(),

    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2>Mã OTP đặt lại mật khẩu ATS</h2>
        <p>Mã OTP của bạn:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${resetToken}</p>
        <p>Mã có hiệu lực trong <strong>10 phút</strong> và chỉ sử dụng được một lần.</p>

        <p>
          Nếu bạn không yêu cầu thao tác này,
          hãy bỏ qua email.
        </p>
      </div>
    `,
  });
}

export async function sendEmployeeActivationEmail(
  toEmail: string,
  temporaryPassword: string,
  activationToken: string,
  expiresAt: Date
): Promise<void> {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP chưa được cấu hình.');
  }

  const activationLink = `${env.FRONTEND_URL}/activate-account?token=${encodeURIComponent(activationToken)}`;
  const expiry = expiresAt.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  await transporter.sendMail({
    from: `"ATS Recruitment System" <${env.MAIL_FROM}>`,
    to: toEmail,
    subject: 'ATS - Kích hoạt tài khoản nhân viên',
    text: `Tài khoản nhân viên của bạn đã được tạo.\nEmail: ${toEmail}\nMật khẩu đăng nhập lần đầu: ${temporaryPassword}\nMã kích hoạt: ${activationToken}\nKích hoạt tại: ${activationLink}\nHạn kích hoạt: ${expiry}. Sau kích hoạt, hãy đăng nhập và đổi mật khẩu ngay.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>Kích hoạt tài khoản ATS</h2><p>Email đăng nhập: <strong>${toEmail}</strong></p><p>Mật khẩu đăng nhập lần đầu: <strong>${temporaryPassword}</strong></p><p>Mã kích hoạt: <strong>${activationToken}</strong></p><p><a href="${activationLink}">Kích hoạt tài khoản</a></p><p>Hạn kích hoạt: <strong>${expiry}</strong></p><p>Sau kích hoạt, đăng nhập và đổi mật khẩu ngay.</p></div>`,
  });
}
