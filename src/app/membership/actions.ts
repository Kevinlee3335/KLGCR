"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, validToken, membershipToken, registrationSchema, nextPeriod, receiptBytes, membershipEnabled, appOrigin } from "@/lib/membership";
import { sealToken } from "@/lib/membership-secrets";

type State = { error: string };
async function checkRequest(form: FormData) {
  if (!membershipEnabled()) throw new Error("Registration is not available yet.");
  if (form.get("website") || form.get("consent") !== "yes") throw new Error("Please confirm your details and consent.");
  const requestHeaders = await headers();
  // Vercel overwrites x-vercel-forwarded-for; never trust a browser-provided generic IP header.
  const ip = requestHeaders.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (process.env.VERCEL && !ip) throw new Error("Unable to verify this request. Please try again.");
  const { data, error } = await createAdminClient().rpc("membership_rate_limit", { p_key: hashToken(ip || "local-development") });
  if (error || data !== true) throw new Error("Too many requests. Please try again in an hour.");
  appOrigin();
}
async function uploadReceipt(form: FormData, memberId: string) {
  const file = await receiptBytes(form.get("receipt"));
  const path = `${memberId}/${randomUUID()}.${file.extension}`;
  const { error } = await createAdminClient().storage.from("membership-receipts").upload(path, file.bytes, { contentType: file.type, upsert: false });
  if (error) throw new Error("Receipt could not be uploaded. Please try again.");
  return path;
}
export async function registerMember(_: State, form: FormData): Promise<State> {
  let token = "";
  let path: string | undefined;
  try {
    await checkRequest(form);
    const parsed = registrationSchema.safeParse(Object.fromEntries(form));
    if (!parsed.success) return { error: "Please complete all required fields with valid details." };
    const db = createAdminClient();
    const id = randomUUID();
    token = membershipToken();
    const ciphertext = sealToken(token);
    path = await uploadReceipt(form, id);
    const { error } = await db.rpc("register_membership", { p_member: { ...parsed.data, id, token_hash: hashToken(token), token_ciphertext: ciphertext }, p_receipt: path });
    if (error) {
      if (error.code === "23505") throw new Error("Unable to register these details again. Use your existing membership link or contact Management.");
      throw new Error("Registration could not be saved. Please try again or contact Management.");
    }
  } catch (error) {
    if (path) await createAdminClient().storage.from("membership-receipts").remove([path]);
    return { error: error instanceof Error ? error.message : "Unable to register. Please try again." };
  }
  revalidatePath("/admin/members");
  redirect(`/membership/manage/${token}?submitted=1`);
}
export async function submitMemberRequest(_: State, form: FormData): Promise<State> {
  let path: string | undefined;
  const token = String(form.get("token") || "");
  try {
    await checkRequest(form);
    if (!validToken(token)) throw new Error("Invalid membership link.");
    const db = createAdminClient();
    const { data: member, error } = await db.from("memberships").select("id,member_type,status,expires_on").eq("token_hash", hashToken(token)).maybeSingle();
    if (error || !member) throw new Error("Invalid membership link.");
    if (member.status !== "active" && member.status !== "pending") throw new Error("Please contact Management about this membership.");
    const period = nextPeriod(member.expires_on);
    if (form.get("period") !== period) throw new Error("Membership changed. Refresh this page before submitting.");
    path = await uploadReceipt(form, member.id);
    const { error: saved } = await db.rpc("submit_membership_receipt", { p_hash: hashToken(token), p_receipt: path, p_period: period });
    if (saved) throw new Error(saved.code === "23505" ? "A receipt for this month is already pending verification or approved." : "Unable to save your receipt. Please try again.");
  } catch (error) {
    if (path) await createAdminClient().storage.from("membership-receipts").remove([path]);
    return { error: error instanceof Error ? error.message : "Unable to submit your request." };
  }
  revalidatePath("/admin/members");
  redirect(`/membership/manage/${token}?submitted=1`);
}
export async function cancelMembership(form: FormData) {
  if (!membershipEnabled() || form.get("confirm") !== "yes") return;
  const token = String(form.get("token") || "");
  if (!validToken(token)) return;
  const { error } = await createAdminClient().rpc("cancel_membership", { p_hash: hashToken(token) });
  if (error) throw new Error("Cancellation could not be saved. Please contact Management.");
  revalidatePath("/admin/members");
  redirect(`/membership/manage/${token}`);
}
