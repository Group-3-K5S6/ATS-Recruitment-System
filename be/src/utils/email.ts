import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createSmtpTransporter() {
  const host = env.SMTP_HOST.trim();
  const user = env.SMTP_USER.trim();
  const password = env.SMTP_PASSWORD.replace(/\s/g, '');
  if (!host || !user || !password) {
    throw new Error('SMTP is not fully configured.');
  }
  if (host.toLowerCase() === 'smtp.gmail.com' && password.length !== 16) {
    throw new Error('Gmail App Password must contain 16 characters.');
  }
  return {
    transporter: nodemailer.createTransport({
      host,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      requireTLS: env.SMTP_PORT === 587 && !env.SMTP_SECURE,
      auth: { user, pass: password },
    }),
    from: env.SMTP_FROM.includes('<') && env.SMTP_FROM.includes('>')
      ? env.SMTP_FROM
      : env.SMTP_FROM.includes('@') ? env.SMTP_FROM : user,
  };
}

export async function sendPasswordResetOtp(to: string, otp: string): Promise<void> {
  const { transporter, from } = createSmtpTransporter();
  await transporter.sendMail({
    from,
    to,
    subject: 'Mã OTP đặt lại mật khẩu ATS',
    text: `Mã OTP đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút và chỉ sử dụng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `<p>Mã OTP đặt lại mật khẩu ATS của bạn:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>Mã có hiệu lực trong 10 phút và chỉ sử dụng được một lần.</p><p>Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>`,
  });
}

export async function sendRegistrationOtp(to: string, otp: string): Promise<void> {
  const { transporter, from } = createSmtpTransporter();
  await transporter.sendMail({
    from, to, subject: 'Mã OTP tạo tài khoản ATS',
    text: `Mã OTP xác minh email để tạo tài khoản ATS là ${otp}. Mã có hiệu lực trong 10 phút và chỉ sử dụng được một lần.`,
    html: `<p>Mã OTP xác minh email để tạo tài khoản ATS:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${otp}</p><p>Mã có hiệu lực trong 10 phút và chỉ sử dụng được một lần.</p>`,
  });
}
