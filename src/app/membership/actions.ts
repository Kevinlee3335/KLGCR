"use server";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, validToken, membershipToken, registrationSchema, nextPeriod, receiptBytes, membershipEnabled, appOrigin, receiptOptionalForTesting } from "@/lib/membership";
import { MEMBERSHIP_DECLARATION_VERSION, MEMBERSHIP_DECLARATION_CLAUSES } from "@/lib/membership-declaration";
import { deliverMembershipEmails } from "@/lib/membership-email";
import { sealToken } from "@/lib/membership-secrets";

type State = { error: string };
async function checkRequest(form: FormData) {
  if (!membershipEnabled()) throw new Error("Registration is not available yet.");
  if (form.get("website") || form.get("consent") !== "yes") throw new Error("Please confirm your details and consent.");
  const requestHeaders = await headers();
  // Vercel overwrites its forwarded headers at the platform boundary.
  const ip = (requestHeaders.get("x-vercel-forwarded-for") || (process.env.VERCEL ? requestHeaders.get("x-forwarded-for") : null))?.split(",")[0]?.trim();
  if (process.env.VERCEL && !ip) throw new Error("Unable to verify this request. Please try again.");
  const { data, error } = await createAdminClient().rpc("membership_rate_limit", { p_key: hashToken(ip || "local-development") });
  if (error || data !== true) throw new Error("Too many requests. Please try again in an hour.");
  appOrigin();
}
async function uploadReceipt(form: FormData, memberId: string) {
  const input = form.get("receipt");
  if (receiptOptionalForTesting() && (!input || (input instanceof File && !input.size))) return null;
  const file = await receiptBytes(input);
  const path = `${memberId}/${randomUUID()}.${file.extension}`;
  const { error } = await createAdminClient().storage.from("membership-receipts").upload(path, file.bytes, { contentType: file.type, upsert: false });
  if (error) throw new Error("Receipt could not be uploaded. Please try again.");
  return path;
}
async function uploadPersonalPhoto(form: FormData, memberId: string, accessCard=false) {
 const input=form.get(accessCard?"access_card":"personal_photo");
 if(!(input instanceof File)||!input.size||input.size>1024*1024) throw new Error(accessCard?"Upload a clear Access Card photo with the bottom code visible.":"Add your personal photo using Take photo or Upload photo.");
 const file=await receiptBytes(input);
 if(file.type==="application/pdf") throw new Error("Your personal photo must be a JPG or PNG image.");
 const path=memberId+"/"+randomUUID()+"."+file.extension;
 const {error}=await createAdminClient().storage.from("membership-photos").upload(path,file.bytes,{contentType:file.type,upsert:false});
 if(error) throw new Error("Your personal photo could not be uploaded. Please try again.");
 return path;
}
export async function registerMember(_: State, form: FormData): Promise<State> {
  let token = "";
  let photoPath: string | undefined;
  let cardPath: string | undefined;
  let path: string | null | undefined;
  try {
    await checkRequest(form);
    if (form.get("rules_consent") !== "yes") throw new Error("Please read and agree to the four membership declaration clauses.");
    const parsed = registrationSchema.safeParse({ ...Object.fromEntries(form), address: form.get("room_no") });
    if (!parsed.success) return { error: "Please complete all required fields with valid details." };
    const receipt=form.get("receipt");
    if(!(receipt instanceof File)||!receipt.size) throw new Error("Upload your payment receipt before registering.");
    const db = createAdminClient();
    const id = randomUUID();
    token = membershipToken();
    const ciphertext = await sealToken(token);
    photoPath = await uploadPersonalPhoto(form, id);
    if(parsed.data.member_type==="resident") cardPath=await uploadPersonalPhoto(form,id,true);
    path = await uploadReceipt(form, id);
    const { error } = await db.rpc("register_membership", { p_member: { ...parsed.data, id, photo_path:photoPath, access_card_path:cardPath||null, declaration_accepted:true, declaration_version:MEMBERSHIP_DECLARATION_VERSION, declaration_clauses:MEMBERSHIP_DECLARATION_CLAUSES, token_hash: hashToken(token), token_ciphertext: ciphertext }, p_receipt: path });
    if (error) {
      if (error.code === "23505") throw new Error("Unable to register these details again. Use your existing membership link or contact Management.");
      throw new Error("Registration could not be saved. Please try again or contact Management.");
    }
    try { await deliverMembershipEmails(id); }
    catch (deliveryError) { console.error("Membership registration email remains queued", deliveryError); }
  } catch (error) {
    if (path) await createAdminClient().storage.from("membership-receipts").remove([path]);
    if (cardPath) await createAdminClient().storage.from("membership-photos").remove([cardPath]);
    if (photoPath) await createAdminClient().storage.from("membership-photos").remove([photoPath]);
    return { error: error instanceof Error ? error.message : "Unable to register. Please try again." };
  }
  revalidatePath("/admin/members");
  redirect(`/membership/manage/${token}?submitted=1`);
}
export async function submitMemberRequest(_: State, form: FormData): Promise<State> {
  let path: string | null | undefined;
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

export async function submitPublicMemberRequest(_: {error:string;success:string}, form: FormData): Promise<{error:string;success:string}> {
  let path: string | null | undefined;
  try {
    await checkRequest(form);
    const name=String(form.get("full_name")||"").trim();
    const idType=String(form.get("id_type")||"");
    const identification=String(form.get("identification")||"").trim();
    const identificationLookup=identification.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const email=String(form.get("email")||"").trim().toLowerCase();
    const intent=String(form.get("intent")||"");
    if (!name || name.length>200 || !["IC","Passport"].includes(idType) || !identificationLookup || identification.length>200 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["renew","cancel"].includes(intent)) throw new Error("Enter your full name, IC / Passport number and a valid email address.");
    const db=createAdminClient();
    const escape=(value:string)=>value.replace(/[\\%_]/g,"\\$&");
    const {data: matches,error: matchError}=await db.from("memberships").select("id,room_no").eq("id_type",idType).eq("identification_lookup",identificationLookup).ilike("full_name",escape(name)).ilike("email",escape(email)).limit(2);
    if (matchError) throw new Error("Unable to submit your request. Please try again.");
    if (intent === "renew") path=await uploadReceipt(form,randomUUID());
    const {error}=await db.from("membership_requests").insert({full_name:name,room_no:matches?.length===1?matches[0].room_no:"Not matched",id_type:idType,identification,email,request_type:intent,member_id:matches?.length===1?matches[0].id:null,receipt_path:path||null});
    if (error && error.code!=="23505") throw new Error("Unable to save your request. Please try again.");
    if (error && path) await db.storage.from("membership-receipts").remove([path]);
    revalidatePath("/admin/members");
    return {error:"",success:"Your request has been submitted for Management verification. Your membership will change only after approval."};
  } catch(error) {
    if(path) await createAdminClient().storage.from("membership-receipts").remove([path]);
    return {error:error instanceof Error?error.message:"Unable to submit your request.",success:""};
  }
}
