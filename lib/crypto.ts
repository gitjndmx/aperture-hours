import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

function secretKey() {
  const value = process.env.APERTURE_SERVER_SECRET;
  if (value && Buffer.byteLength(value) >= 32) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APERTURE_SERVER_SECRET must contain at least 32 bytes");
  }
  return "local-development-secret-change-before-production-0001";
}

export function randomShareId() {
  return randomBytes(24).toString("base64url");
}

export function randomBrowserKey() {
  return randomBytes(32).toString("base64url");
}

export function signBrowserKey(value: string) {
  const signature = createHmac("sha256", secretKey()).update(`browser:${value}`).digest("base64url");
  return `${value}.${signature}`;
}

export function verifyBrowserKey(signed: string | undefined) {
  if (!signed) return null;
  const split = signed.lastIndexOf(".");
  if (split < 1) return null;
  const value = signed.slice(0, split);
  const signature = signed.slice(split + 1);
  const expected = createHmac("sha256", secretKey()).update(`browser:${value}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right) ? value : null;
}

export function deriveDeletionSecret(browserKey: string, idempotencyKey: string) {
  return createHmac("sha256", secretKey())
    .update(`delete:${browserKey}:${idempotencyKey}`)
    .digest("base64url");
}

export function hashDeletionSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function safeHashEqual(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
