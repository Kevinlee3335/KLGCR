import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotifications } from "@/lib/push";
import { COMMON_EMAIL_FOOTER, sendTransactionalEmail } from "@/lib/email";

export type AppNotificationType =
  | "complaint_created"
  | "job_assigned"
  | "tenant_not_available"
  | "job_completed"
  | "appointment_updated"
  | "checkout_assigned"
  | "checkout_completed"
  | "material_request";

type NotificationInput = {
  recipientIds: string[];
  type: AppNotificationType;
  title: string;
  body: string;
  href: string;
  entityId?: string | null;
};

export async function createAppNotifications(input: NotificationInput) {
  const recipientIds = [...new Set(input.recipientIds.filter(Boolean))];
  if (!recipientIds.length) return;

  const db = createAdminClient();
  const { error } = await db.from("app_notifications").insert(
    recipientIds.map((recipient_id) => ({
      recipient_id,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
      entity_id: input.entityId || null,
    })),
  );
  if (error) throw new Error(`Unable to create notification: ${error.message}`);
  await sendPushNotifications({ recipientIds, title: input.title, body: input.body, href: input.href });
}

export async function notifyActiveAdmins(input: Omit<NotificationInput, "recipientIds">) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Unable to find administrators: ${error.message}`);
  await createAppNotifications({ ...input, recipientIds: (data || []).map((profile) => profile.id) });
}


export async function notifyMaterialRequestRecipients(input: NotificationInput) {
  const recipientIds = [...new Set(input.recipientIds.filter(Boolean))];
  if (!recipientIds.length) return;
  const db = createAdminClient();
  const { data: recipients, error } = await db
    .from("profiles")
    .select("id,email")
    .in("id", recipientIds)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Unable to find material request recipients: ${error.message}`);

  const activeIds = (recipients || []).map((recipient) => recipient.id);
  await createAppNotifications({ ...input, recipientIds: activeIds });
  await Promise.all((recipients || []).map((recipient) => sendTransactionalEmail(recipient.email, {
    subject: input.title,
    text: `${input.body}

Open the KLG Campus Residence Operations Management System for details.

Best regards,
KLG Campus Residence Management

${COMMON_EMAIL_FOOTER}`,
  })));
}

export async function notifyActiveMaterialApprovers(input: Omit<NotificationInput, "recipientIds">) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("profiles")
    .select("id")
    .in("role", ["admin", "management_viewer"])
    .eq("is_active", true)
    .is("deleted_at", null);
  if (error) throw new Error(`Unable to find material approvers: ${error.message}`);
  await notifyMaterialRequestRecipients({ ...input, recipientIds: (data || []).map((profile) => profile.id) });
}
