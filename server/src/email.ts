import nodemailer from 'nodemailer';
import type { Config } from './config.js';

/** Centralize SMTP credentials; never log OTP content or mailer exceptions. */
export async function sendVerificationCode(
  config: Config, recipient: string, code: string, purpose: 'registration' | 'password reset',
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    // Fail closed when a port-587 server cannot negotiate STARTTLS.
    requireTLS: config.smtp.port !== 465,
    tls: { rejectUnauthorized: true },
    auth: { user: config.smtp.user, pass: config.smtp.password },
  });
  try {
    await transport.sendMail({
      from: config.smtp.from || config.smtp.user,
      to: recipient,
      subject: purpose === 'registration' ? 'DeAIfy account verification' : 'DeAIfy password reset',
      text: 'Your ' + purpose + ' code: ' + code +
        '\nExpires in 10 minutes. Do not share it.\nIf you did not request this, ignore the email.',
    });
  } finally {
    transport.close();
  }
}
