import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = parseInt(process.env.SMTP_PORT || "465", 10);
const user = process.env.SMTP_USER || "";
const pass = process.env.SMTP_PASS || "";
const FROM = process.env.MAIL_FROM || `Pisster <${user}>`;
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

const wrap = (title: string, body: string, brandName = "Pisster") => `
  <div style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;background:#18181b;color:#e4e4e7;padding:28px;border-radius:12px">
    <h1 style="color:#f472b6;font-size:20px;margin:0 0 16px">${title}</h1>
    ${body}
    <p style="color:#71717a;font-size:12px;margin-top:24px">${brandName}</p>
  </div>`;

export async function sendVerificationCode(
  to: string,
  code: string,
  purpose: "SIGNUP" | "LOGIN",
  brandName = "Pisster"
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
    brandName,
  });
}

export async function sendCreatorApplicationReceived(toUser: string, displayName: string) {
  return sendMail({
    to: toUser,
    subject: "Your creator request was received",
    html: wrap(
      "Creator application received",
      `<p>Hi ${displayName},</p>
       <p>Thanks for applying to become a creator on Pisster. Our team is reviewing your
       application and you'll hear back soon.</p>`
    ),
    text: `Hi ${displayName}, your Pisster creator application was received and is under review.`,
  });
}

export async function sendAdminNewApplication(opts: {
  applicantEmail: string;
  displayName: string;
  siteDomain: string;
  reviewUrl: string;
}) {
  if (!ADMIN_NOTIFY) {
    logger.warn("ADMIN_NOTIFY_EMAIL not set; skipping admin application notice");
    return false;
  }
  return sendMail({
    to: ADMIN_NOTIFY,
    subject: `New creator application from ${opts.displayName} on ${opts.siteDomain}`,
    html: wrap(
      "New creator application",
      `<p><strong>${opts.displayName}</strong> (${opts.applicantEmail}) applied to become a
       creator on <strong>${opts.siteDomain}</strong>.</p>
       <p><a href="${opts.reviewUrl}" style="color:#f472b6">Review the application →</a></p>`
    ),
    text: `New creator application from ${opts.displayName} (${opts.applicantEmail}) on ${opts.siteDomain}. Review: ${opts.reviewUrl}`,
  });
}
