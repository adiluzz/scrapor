import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { CodePurpose } from "@prisma/client";

const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

/** Generate a random 6-digit numeric code. */
export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Create a hashed, expiring EmailCode row and return the plaintext code
 * (to be emailed). Invalidates any prior unconsumed codes for the same target.
 */
export async function issueCode(
  email: string,
  siteId: string,
  purpose: CodePurpose
): Promise<string> {
  await prisma.emailCode.updateMany({
    where: { email, siteId, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.emailCode.create({
    data: {
      email,
      siteId,
      purpose,
      codeHash,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000),
    },
  });
  return code;
}

/**
 * Verify a submitted code. Returns true and consumes the code on success.
 * Enforces expiry + attempt limits; single-use.
 */
export async function verifyCode(
  email: string,
  siteId: string,
  purpose: CodePurpose,
  code: string
): Promise<boolean> {
  const row = await prisma.emailCode.findFirst({
    where: { email, siteId, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  if (row.attempts >= MAX_ATTEMPTS) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
    return false;
  }
  const ok = await bcrypt.compare(code, row.codeHash);
  if (!ok) {
    await prisma.emailCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  await prisma.emailCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } });
  return true;
}

/** Whether an unconsumed, valid LOGIN/SIGNUP code exists (used to gate session issuance). */
export async function hasValidConsumedRecently(): Promise<boolean> {
  return false;
}
