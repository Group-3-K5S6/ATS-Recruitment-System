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

export interface ApplicationEmailParams {
  toEmail: string;
  fullName: string;
  jobTitle: string;
  trackingCode: string;
  companyName?: string;
}

/**
 * Gửi email xác nhận nộp hồ sơ ứng tuyển thành công kèm mã tra cứu duy nhất.
 * Xử lý lỗi an toàn để không làm gián đoạn luồng nộp hồ sơ nếu dịch vụ SMTP gặp sự cố.
 */
export async function sendApplicationConfirmationEmail(
  params: ApplicationEmailParams
): Promise<{ success: boolean; error?: string }> {
  const { toEmail, fullName, jobTitle, trackingCode, companyName = 'ATS Recruitment' } = params;

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(`[Email Service] SMTP chưa được cấu hình. Bỏ qua gửi email xác nhận tới ${toEmail}.`);
    return { success: false, error: 'SMTP chưa được cấu hình.' };
  }

  const subject = `[${companyName}] Xác nhận nộp hồ sơ ứng tuyển: ${jobTitle} (Mã: ${trackingCode})`;

  const textContent = `
Xin chào ${fullName},

Hệ thống tuyển dụng ${companyName} xin thông báo bạn đã nộp hồ sơ ứng tuyển thành công cho vị trí:
${jobTitle}

Mã tra cứu hồ sơ của bạn là:
${trackingCode}

Vui lòng lưu lại mã tra cứu này để theo dõi tiến trình xét duyệt hồ sơ trên cổng tuyển dụng.
Bộ phận tuyển dụng sẽ sớm liên hệ với bạn theo thông tin liên lạc bạn đã cung cấp.

Trân trọng,
Đội ngũ Tuyển dụng ${companyName}
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #111827; margin-bottom: 16px;">Xác nhận nộp hồ sơ thành công</h2>
      <p style="color: #374151; font-size: 15px;">Xin chào <strong>${fullName}</strong>,</p>
      <p style="color: #374151; font-size: 15px; line-height: 1.5;">
        Hồ sơ ứng tuyển của bạn cho vị trí <strong>${jobTitle}</strong> đã được hệ thống ghi nhận thành công.
      </p>

      <div style="margin: 24px 0; padding: 16px; background-color: #f3f4f6; border-radius: 6px; border-left: 4px solid #2563eb;">
        <span style="font-size: 13px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; display: block; margin-bottom: 4px;">Mã tra cứu hồ sơ</span>
        <strong style="font-size: 20px; color: #1e40af; font-family: monospace; letter-spacing: 1px;">${trackingCode}</strong>
      </div>

      <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
        Vui lòng lưu lại mã tra cứu trên để kiểm tra trạng thái hồ sơ của bạn. Bộ phận tuyển dụng sẽ xem xét hồ sơ và thông báo kết quả qua email hoặc số điện thoại bạn đã đăng ký.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Email này được gửi tự động từ hệ thống ${companyName}. Vui lòng không trả lời trực tiếp email này.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${env.MAIL_FROM}>`,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });
    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Email Service] Gửi email xác nhận thất bại tới ${toEmail}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}