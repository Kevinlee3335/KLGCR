import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushNotifications } from "@/lib/push";
import type { NotificationKey } from "@/lib/notification-preferences";

export async function recordSyncHealth(source: "google_form" | "inventory", scope: string, failed: boolean, detail: string) {
  try {
    const { data, error } = await createAdminClient().rpc("record_integration_sync", { p_source: source, p_scope: scope.slice(0, 200), p_failed: failed, p_detail: detail.slice(0, 240) });
    if (error) { console.error("Unable to record integration sync health", error); return; }
    const notifications = data as { recipient_id: string; notification_type: NotificationKey; notification_title: string; notification_body: string }[] | null;
    if (!notifications?.length) return;
    const first = notifications[0];
    await sendPushNotifications({ recipientIds: notifications.map(n => n.recipient_id), type: first.notification_type, title: first.notification_title, body: first.notification_body, href: "/admin/settings" });
  } catch (error) { console.error("Unable to deliver integration sync alert", error); }
}
