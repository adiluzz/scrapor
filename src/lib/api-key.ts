import crypto from "crypto";
import type { ApiKeyType } from "@prisma/client";

export const API_KEY_TYPES = ["READ_ONLY", "FULL_ACCESS"] as const;
export type ApiKeyTypeName = (typeof API_KEY_TYPES)[number];

const TYPE_CODES: Record<ApiKeyType, string> = {
  READ_ONLY: "ro",
  FULL_ACCESS: "fa",
};

const CODE_TO_TYPE: Record<string, ApiKeyType> = {
  ro: "READ_ONLY",
  fa: "FULL_ACCESS",
};

const TOKEN_PREFIX = "spk";
const HMAC_ALGO = "sha256";
const TOKEN_PARSE_RE = /^spk_(ro|fa)_(\d+)_([A-Za-z0-9_-]+)$/;

function getApiKeySecret(): string {
  const secret = process.env.API_KEY_SECRET?.trim();
  if (!secret) {
    throw new Error("API_KEY_SECRET is not configured");
  }
  if (secret.length < 32) {
    throw new Error("API_KEY_SECRET must be at least 32 characters");
  }
  return secret;
}

export function getTypeCode(type: ApiKeyType): string {
  return TYPE_CODES[type];
}

export function apiKeyTypeLabel(type: ApiKeyType): string {
  switch (type) {
    case "READ_ONLY":
      return "Read Only";
    case "FULL_ACCESS":
      return "Full Access";
    default:
      return type;
  }
}

export function maskedApiKeyHint(type: ApiKeyType, keyNumber: number): string {
  return `${TOKEN_PREFIX}_${getTypeCode(type)}_${keyNumber}_••••••••`;
}

export function generateApiKey(
  type: ApiKeyType,
  keyNumber: number
): { rawKey: string; hash: string } {
  const secretPart = crypto.randomBytes(32).toString("base64url");
  const rawKey = `${TOKEN_PREFIX}_${getTypeCode(type)}_${keyNumber}_${secretPart}`;
  return { rawKey, hash: hashApiKey(rawKey) };
}

export function hashApiKey(rawKey: string): string {
  const secret = getApiKeySecret();
  return crypto.createHmac(HMAC_ALGO, secret).update(rawKey.trim(), "utf8").digest("hex");
}

export function parseApiKey(rawKey: string): {
  valid: boolean;
  typeCode?: string;
  keyNumber?: number;
  type?: ApiKeyType;
} {
  const trimmed = rawKey?.trim();
  if (!trimmed) return { valid: false };

  const match = trimmed.match(TOKEN_PARSE_RE);
  if (!match) return { valid: false };

  const typeCode = match[1];
  const type = CODE_TO_TYPE[typeCode];
  if (!type) return { valid: false };

  const keyNumber = parseInt(match[2], 10);
  if (!Number.isInteger(keyNumber) || keyNumber <= 0) {
    return { valid: false };
  }

  const secretPart = match[3];
  if (!secretPart || secretPart.length < 16) {
    return { valid: false };
  }

  return { valid: true, typeCode, keyNumber, type };
}

export function verifyApiKey(rawKey: string, storedHash: string | null): boolean {
  if (!rawKey?.trim() || !storedHash) return false;
  let computed: string;
  try {
    computed = hashApiKey(rawKey);
  } catch {
    return false;
  }
  if (computed.length !== storedHash.length) return false;
  let out = 0;
  for (let i = 0; i < computed.length; i++) {
    out |= computed.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return out === 0;
}

export function isApiKeyType(value: unknown): value is ApiKeyType {
  return typeof value === "string" && (API_KEY_TYPES as readonly string[]).includes(value);
}
