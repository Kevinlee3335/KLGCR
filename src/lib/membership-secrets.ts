import { createAdminClient } from "@/lib/supabase/admin";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
async function key() {
  let secret = process.env.KLGCR_MEMBERSHIP_TOKEN_SECRET;
  if (!secret) {
    const {data,error} = await createAdminClient().from("membership_runtime").select("token_secret").eq("id",true).single();
    if (error || !data) throw new Error("Membership token encryption is not configured.");
    secret = data.token_secret as string;
  }
  if (!secret || secret.length < 32) throw new Error("Membership token encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}
export async function sealToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export async function openToken(value: string) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", await key(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}
