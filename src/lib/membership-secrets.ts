import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
function key() {
  const secret = process.env.KLGCR_MEMBERSHIP_TOKEN_SECRET;
  if (!secret || secret.length < 32) throw new Error("Membership token encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
export function sealToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function openToken(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
