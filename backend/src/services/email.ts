import nodemailer from 'nodemailer';
import { logger } from '../logger';

const log = logger.child({ module: 'email' });

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Overhead <noreply@overheadflight.com>';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5174';

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY || !!SMTP_HOST;
}

export function getAppUrl(): string {
  return APP_URL.replace(/\/+$/, '');
}

interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

async function sendViaResend(msg: OutboundEmail): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${body}`);
  }
}

async function sendViaSmtp(msg: OutboundEmail): Promise<void> {
  if (!SMTP_HOST) throw new Error('SMTP_HOST not set');
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
  await transport.sendMail({
    from: EMAIL_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}

async function send(msg: OutboundEmail, kind: string): Promise<void> {
  if (!isEmailConfigured()) {
    log.info({ to: msg.to, kind }, 'email not configured — skipping');
    return;
  }
  try {
    if (RESEND_API_KEY) {
      await sendViaResend(msg);
    } else {
      await sendViaSmtp(msg);
    }
    log.info({ to: msg.to, kind }, 'email sent');
  } catch (err) {
    log.error({ err, to: msg.to, kind }, 'failed to send email');
  }
}

// ── Shared email chrome ─────────────────────────────────────────────────────

function htmlShell(headline: string, body: string): string {
  return `
    <div style="font-family: 'IBM Plex Mono', monospace; background: #0a0a0a; color: #e0e0e0; padding: 32px; max-width: 560px; margin: 0 auto; border-radius: 8px;">
      <h2 style="color: #5b9bd5; letter-spacing: 2px; text-transform: uppercase; font-size: 14px; margin-bottom: 24px;">OVERHEAD // ${headline}</h2>
      ${body}
      <p style="color: #888; font-size: 12px; margin-top: 32px;">— The Overhead team</p>
    </div>
  `;
}

function buttonHtml(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: #5b9bd5; color: #0a0a0a; padding: 12px 20px; border-radius: 4px; text-decoration: none; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; font-size: 12px;">${label}</a>`;
}

// ── Public senders ──────────────────────────────────────────────────────────

export async function sendWelcomeEmail(to: string): Promise<void> {
  await send({
    to,
    subject: 'Welcome to Overhead',
    text: [
      `Welcome to Overhead!`,
      ``,
      `You're now set up to track aircraft flying over your location.`,
      `Head over to the app, enter your home coordinates in Settings,`,
      `and start building your personal flight history.`,
      ``,
      `${getAppUrl()}`,
      ``,
      `— The Overhead team`,
    ].join('\n'),
    html: htmlShell('WELCOME', `
      <p style="margin-bottom: 16px; line-height: 1.6;">You're now set up to track aircraft flying over your location.</p>
      <p style="margin-bottom: 16px; line-height: 1.6;">Head over to the app, enter your home coordinates in <strong>Settings</strong>, and start building your personal flight history.</p>
      <p style="margin-bottom: 24px;">${buttonHtml(getAppUrl(), 'Open Overhead')}</p>
    `),
  }, 'welcome');
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${getAppUrl()}/?reset_token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Reset your Overhead password',
    text: [
      `Someone requested a password reset for your Overhead account.`,
      ``,
      `If that was you, open this link within the next hour:`,
      `${link}`,
      ``,
      `If you didn't request this, you can safely ignore this email —`,
      `your password will not change.`,
      ``,
      `— The Overhead team`,
    ].join('\n'),
    html: htmlShell('RESET PASSWORD', `
      <p style="margin-bottom: 16px; line-height: 1.6;">Someone requested a password reset for your Overhead account.</p>
      <p style="margin-bottom: 24px; line-height: 1.6;">If that was you, click the button below within the next hour:</p>
      <p style="margin-bottom: 24px;">${buttonHtml(link, 'Reset password')}</p>
      <p style="margin-bottom: 16px; line-height: 1.6; color: #888; font-size: 13px;">Or paste this URL into your browser:<br/><span style="word-break: break-all;">${link}</span></p>
      <p style="margin-bottom: 16px; line-height: 1.6;">If you didn't request this, you can safely ignore this email — your password will not change.</p>
    `),
  }, 'password-reset');
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${getAppUrl()}/?verify_token=${encodeURIComponent(token)}`;
  await send({
    to,
    subject: 'Confirm your Overhead email',
    text: [
      `Welcome to Overhead. Confirm your email so we can keep in touch`,
      `about your account:`,
      ``,
      `${link}`,
      ``,
      `This link is valid for 7 days. You can keep using the app while`,
      `you wait — confirming just unlocks password recovery later.`,
      ``,
      `— The Overhead team`,
    ].join('\n'),
    html: htmlShell('CONFIRM EMAIL', `
      <p style="margin-bottom: 16px; line-height: 1.6;">Welcome to Overhead. Confirm your email so we can keep in touch about your account and enable password recovery.</p>
      <p style="margin-bottom: 24px;">${buttonHtml(link, 'Confirm email')}</p>
      <p style="margin-bottom: 16px; line-height: 1.6; color: #888; font-size: 13px;">Or paste this URL into your browser:<br/><span style="word-break: break-all;">${link}</span></p>
      <p style="margin-bottom: 16px; line-height: 1.6;">This link is valid for 7 days.</p>
    `),
  }, 'verification');
}
