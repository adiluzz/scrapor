import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = parseInt(process.env.SMTP_PORT || "465", 10);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || (user ? `Site <${user}>` : "");
const ADMIN_NOTIFY = process.env.ADMIN_NOTIFY_EMAIL || "";

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!user || !pass) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }
  return transporter;
}

/** Send an email. Never throws — logs failures so callers never break. */
export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Override From display, e.g. `FBB Tube <office@…>`. */
  from?: string;
  replyTo?: string;
  brandName?: string;
}): Promise<boolean> {
  const tx = getTransport();
  if (!tx) {
    logger.warn({ to: opts.to, subject: opts.subject }, "mailer not configured; skipping send");
    return false;
  }
  try {
    await tx.sendMail({
      from: opts.from || FROM,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    });
    logger.info({ to: opts.to, subject: opts.subject }, "email sent");
    return true;
  } catch (err) {
    logger.error({ err: String(err), to: opts.to, subject: opts.subject }, "email send failed");
    return false;
  }
}

const wrap = (title: string, body: string, brandName: string) => `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;background:#18181b;color:#e4e4e7;padding:28px;border-radius:12px">
    <h1 style="color:#f472b6;font-size:20px;margin:0 0 16px">${title}</h1>
    ${body}
    <p style="color:#71717a;font-size:12px;margin-top:24px">${brandName}</p>
  </div>`;

export async function sendVerificationCode(
  to: string,
  code: string,
  purpose: "SIGNUP" | "LOGIN",
  brandName: string,
  from?: string
) {
  const label = purpose === "SIGNUP" ? "confirm your account" : "sign in";
  return sendMail({
    to,
    subject: `Your ${brandName} ${purpose === "SIGNUP" ? "sign-up" : "login"} code: ${code}`,
    html: wrap(
      "Your verification code",
      `<p>Use this code to ${label}. It expires in 10 minutes.</p>
       <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#fff">${code}</p>
       <p style="color:#a1a1aa">If you didn't request this, ignore this email.</p>`,
      brandName
    ),
    text: `Your ${brandName} code is ${code}. It expires in 10 minutes.`,
    from,
    brandName,
  });
}

export async function sendCreatorApplicationReceived(
  toUser: string,
  displayName: string,
  brandName: string,
  from?: string
) {
  return sendMail({
    to: toUser,
    subject: "Your creator request was received",
    html: wrap(
      "Creator application received",
      `<p>Hi ${displayName},</p>
       <p>Thanks for applying to become a creator on ${brandName}. Our team is reviewing your
       application and you'll hear back soon.</p>`,
      brandName
    ),
    text: `Hi ${displayName}, your ${brandName} creator application was received and is under review.`,
    from,
  });
}

/** Approval email for a creator on a specific site (shared dashboard, per-site publishing). */
export async function sendCreatorApplicationApproved(opts: {
  to: string;
  displayName: string;
  siteDomain: string;
  brandName: string;
  dashboardUrl: string;
  reviewNote?: string | null;
  from?: string;
}) {
  const adminEmail = `admin@${opts.siteDomain}`;
  const noteHtml = opts.reviewNote
    ? `<p style="color:#a1a1aa">Note from the team: ${opts.reviewNote}</p>`
    : "";
  const noteText = opts.reviewNote ? `\n\nNote from the team: ${opts.reviewNote}` : "";
  return sendMail({
    to: opts.to,
    subject: `Welcome, creator — you're approved on ${opts.brandName}`,
    html: wrap(
      "Welcome, creator",
      `<p>Hi ${opts.displayName},</p>
       <p>Congratulations! Your creator application for <strong>${opts.brandName}</strong>
       (${opts.siteDomain}) was approved.</p>
       <p>You can use the shared creator dashboard to upload videos for this site:
       <a href="${opts.dashboardUrl}" style="color:#f472b6">${opts.dashboardUrl}</a></p>
       <p>Welcome creator. If you are having any trouble with our creator dashboard,
       please help us to make it better and contact
       <a href="mailto:${adminEmail}" style="color:#f472b6">${adminEmail}</a>.</p>
       ${noteHtml}`,
      opts.brandName
    ),
    text:
      `Welcome, creator. You're approved on ${opts.brandName} (${opts.siteDomain}). ` +
      `Dashboard: ${opts.dashboardUrl}\n\n` +
      `Welcome creator. If you are having any trouble with our creator dashboard. ` +
      `Please help us to make it better and contact ${adminEmail}.${noteText}`,
    from: opts.from,
  });
}

export async function sendAdminNewApplication(opts: {
  applicantEmail: string;
  displayName: string;
  siteDomain: string;
  reviewUrl: string;
  brandName?: string;
}) {
  if (!ADMIN_NOTIFY) {
    logger.warn("ADMIN_NOTIFY_EMAIL not set; skipping admin application notice");
    return false;
  }
  const brand = opts.brandName || opts.siteDomain;
  return sendMail({
    to: ADMIN_NOTIFY,
    subject: `New creator application from ${opts.displayName} on ${opts.siteDomain}`,
    html: wrap(
      "New creator application",
      `<p><strong>${opts.displayName}</strong> (${opts.applicantEmail}) applied to become a
       creator on <strong>${opts.siteDomain}</strong>.</p>
       <p><a href="${opts.reviewUrl}" style="color:#f472b6">Review the application →</a></p>`,
      brand
    ),
    text: `New creator application from ${opts.displayName} (${opts.applicantEmail}) on ${opts.siteDomain}. Review: ${opts.reviewUrl}`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inquiry from the Sharlila contact form, delivered to the monitored studio inbox. */
export async function sendStudioInquiry(opts: {
  to: string;
  name: string;
  email: string;
  intentLabel: string;
  message: string;
  brandName: string;
  from?: string;
}) {
  const name = escapeHtml(opts.name);
  const email = escapeHtml(opts.email);
  const intent = escapeHtml(opts.intentLabel);
  const message = escapeHtml(opts.message).replace(/\n/g, "<br>");
  return sendMail({
    to: opts.to,
    replyTo: opts.email,
    from: opts.from,
    subject: `Studio inquiry: ${opts.intentLabel} — ${opts.name}`,
    html: wrap(
      "New studio inquiry",
      `<p><strong>${name}</strong> (${email}) wrote about <strong>${intent}</strong>.</p>
       <p>${message}</p>`,
      opts.brandName
    ),
    text: `${opts.name} <${opts.email}>\n${opts.intentLabel}\n\n${opts.message}`,
  });
}
