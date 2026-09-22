import { createAdminClient } from "@/lib/supabase/admin";

export type AppNotificationType =
  | "complaint_created"
  | "job_assigned"
  | "tenant_not_available"
  | "job_completed"
  | "appointment_updated"
  | "checkout_assigned"
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
