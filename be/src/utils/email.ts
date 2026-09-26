/**
 * Email Service Utility for ATS System
 * Handles password reset email dispatching and logging.
 */

export interface SendEmailResult {
  email: string;
  resetLink: string;
  sentAt: Date;
}

// In-memory log of sent emails for testing and debugging inspection
export const sentEmailsLog: SendEmailResult[] = [];

export async function sendResetPasswordEmail(
  toEmail: string,
  resetToken: string,
  baseUrl: string = 'http://localhost:3000'
): Promise<SendEmailResult> {
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

  const emailResult: SendEmailResult = {
    email: toEmail,
    resetLink,
    sentAt: new Date(),
  };

  sentEmailsLog.push(emailResult);

  if (process.env.NODE_ENV !== 'test') {
    console.log(`[EMAIL SERVICE] Password Reset Link sent to ${toEmail}: ${resetLink}`);
  }

  return emailResult;
}
