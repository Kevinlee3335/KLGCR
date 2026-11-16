import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const flexAddress = z.string().trim().max(254).email().regex(/^[a-z0-9._%+-]+@flex\.com$/i);
const recipientSchema = z.object({
  to: flexAddress,
  cc: z.tuple([flexAddress, flexAddress]),
}).refine(({ to, cc }) => new Set([to, ...cc].map(email => email.toLowerCase())).size === 3);

export type FlexInspectionMailRecipients = z.infer<typeof recipientSchema>;

export async function flexInspectionMailRecipients(): Promise<FlexInspectionMailRecipients | null> {
  const setting = process.env.KLGCR_FLEX_MAIL_RECIPIENTS;
  let recipients: unknown;
  if (setting !== undefined) {
    try {
      recipients = JSON.parse(setting);
    } catch {
      return null;
    }
  } else if (process.env.VERCEL_ENV === "production") {
    const { data, error } = await createAdminClient().from("flex_inspection_mail_config")
      .select("recipients").eq("id", true).maybeSingle();
    if (error) throw Error("Unable to load the Flex mail recipients.");
    recipients = data?.recipients;
  }
  const result = recipientSchema.safeParse(recipients);
  return result.success ? result.data : null;
}
