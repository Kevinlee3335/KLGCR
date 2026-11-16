import { z } from "zod";

const flexAddress = z.string().trim().max(254).email().regex(/^[a-z0-9._%+-]+@flex\.com$/i);
const recipientSchema = z.object({
  to: flexAddress,
  cc: z.tuple([flexAddress, flexAddress]),
}).refine(({ to, cc }) => new Set([to, ...cc].map(email => email.toLowerCase())).size === 3);

export type FlexInspectionMailRecipients = z.infer<typeof recipientSchema>;

export function flexInspectionMailRecipients(): FlexInspectionMailRecipients | null {
  const setting = process.env.KLGCR_FLEX_MAIL_RECIPIENTS;
  if (!setting) return null;
  try {
    const result = recipientSchema.safeParse(JSON.parse(setting));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
