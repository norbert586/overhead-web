import nodemailer from 'nodemailer';
import { logger } from '../logger';

const log = logger.child({ module: 'email' });

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM ?? 'Overhead <noreply@overhead.app>';

function getTransport() {
  if (!SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });
}

export async function sendWelcomeEmail(to: string): Promise<void> {
  const transport = getTransport();
  if (!transport) {
    log.info({ to }, 'SMTP not configured — skipping welcome email');
    return;
  }

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to,
      subject: 'Welcome to Overhead',
      text: [
        `Welcome to Overhead!`,
        ``,
        `You're now set up to track aircraft flying over your location.`,
        `Head over to the app, enter your home coordinates in Settings,`,
        `and start building your personal flight history.`,
        ``,
        `Every aircraft that passes overhead gets logged — commercial, cargo,`,
        `government, military. Over time you'll see patterns: the daily`,
        `commuter routes, the occasional unusual callsign, regulars that`,
        `seem to circle your neighborhood.`,
        ``,
        `Your data is yours and persists across sessions. Log in from any`,
        `device and pick up right where you left off.`,
        ``,
        `— The Overhead team`,
      ].join('\n'),
      html: `
        <div style="font-family: 'IBM Plex Mono', monospace; background: #0a0a0a; color: #e0e0e0; padding: 32px; max-width: 560px; margin: 0 auto; border-radius: 8px;">
          <h2 style="color: #5b9bd5; letter-spacing: 2px; text-transform: uppercase; font-size: 14px; margin-bottom: 24px;">OVERHEAD // WELCOME</h2>
          <p style="margin-bottom: 16px; line-height: 1.6;">You're now set up to track aircraft flying over your location.</p>
          <p style="margin-bottom: 16px; line-height: 1.6;">Head over to the app, enter your home coordinates in <strong>Settings</strong>, and start building your personal flight history.</p>
          <p style="margin-bottom: 16px; line-height: 1.6;">Every aircraft that passes overhead gets logged — commercial, cargo, government, military. Over time you'll see patterns: the daily commuter routes, the occasional unusual callsign, regulars that seem to circle your neighborhood.</p>
          <p style="margin-bottom: 24px; line-height: 1.6;">Your data persists across sessions and devices. Log in from anywhere and pick up right where you left off.</p>
          <p style="color: #888; font-size: 12px;">— The Overhead team</p>
        </div>
      `,
    });
    log.info({ to }, 'welcome email sent');
  } catch (err) {
    log.error({ err, to }, 'failed to send welcome email');
  }
}
