import 'server-only';
import nodemailer from 'nodemailer';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface SendInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(input: SendInput): Promise<{ messageId: string }>;
}

export function makeMailer(cfg: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.password },
  });

  return {
    async send({ to, subject, html, text }) {
      const info = await transport.sendMail({
        from: cfg.from,
        to,
        subject,
        html,
        text,
      });
      return { messageId: String(info.messageId ?? '') };
    },
  };
}

// Default mailer wired from env. Lazily constructed.
let cached: Mailer | null = null;
export function defaultMailer(): Mailer {
  if (cached) return cached;
  cached = makeMailer({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER!,
    password: process.env.SMTP_PASSWORD!,
    from: process.env.SMTP_FROM!,
  });
  return cached;
}
