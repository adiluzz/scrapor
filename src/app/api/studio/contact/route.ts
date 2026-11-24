import { NextResponse } from "next/server";
import { z } from "zod";
import { siteContactEmail } from "@/lib/legal-contact";
import { logger } from "@/lib/logger";
import { sendStudioInquiry } from "@/lib/mailer";
import { rateLimit } from "@/lib/redis";
import { getCurrentSite } from "@/lib/site";
import { STUDIO_INQUIRY_INTENTS, STUDIO_INQUIRY_LABELS } from "@/lib/studio-copy";

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(200),
  intent: z.enum(STUDIO_INQUIRY_INTENTS),
  message: z.string().trim().min(10).max(4000),
  company: z.string().max(200).optional(),
});

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(request: Request) {
  const site = await getCurrentSite();
  if (site.kind !== "STUDIO") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the form and try again." }, { status: 400 });
  }

  if (parsed.data.company?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(request);
  const allowed = await rateLimit(`studio-contact:${ip}`, 5, 3600);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many messages. Email us directly instead." },
      { status: 429 }
    );
  }

  const contactEmail = siteContactEmail(site.domain);
  const brand = site.mailFromName || site.name;
  const smtpUser = process.env.SMTP_USER || "";
  const from = smtpUser ? `${brand} <${smtpUser}>` : undefined;

  const sent = await sendStudioInquiry({
    to: contactEmail,
    name: parsed.data.name,
    email: parsed.data.email,
    intentLabel: STUDIO_INQUIRY_LABELS[parsed.data.intent],
    message: parsed.data.message,
    brandName: brand,
    from,
  });

  if (!sent) {
    logger.warn({ domain: site.domain }, "studio contact email was not sent");
    return NextResponse.json(
      { error: `We couldn't send that. Email ${contactEmail} directly.` },
      { status: 503 }
    );
  }

  logger.info({ domain: site.domain, intent: parsed.data.intent }, "studio inquiry sent");
  return NextResponse.json({ ok: true });
}
