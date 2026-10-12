import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

import { phoneNotificationEnabled, type NotificationKey, type PushPreferences } from "@/lib/notification-preferences";

type PushPayload = { type: NotificationKey; recipientIds: string[]; title: string; body: string; href: string };

function configured() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:klgresidenceenquiry@gmail.com", publicKey, privateKey);
  return publicKey;
}

export function vapidPublicKey() { return configured(); }

export async function sendPushNotifications(payload: PushPayload) {
  if (!configured() || !payload.recipientIds.length) return;
  const db = createAdminClient();
  const { data: preferences, error: preferenceError } = await db.from("phone_notification_preferences").select("user_id,enabled,events").in("user_id", payload.recipientIds);
  if (preferenceError) {
    // Preserve existing delivery while the additive migration is not yet installed.
    if (!["42P01", "PGRST205"].includes(preferenceError.code)) { console.error("Unable to read phone notification preferences", preferenceError); return; }
  }
  const eligible = payload.recipientIds.filter(id => phoneNotificationEnabled((preferences as PushPreferences[] | null)?.find(p => p.user_id === id), payload.type));
  if (!eligible.length) return;
  const { data: subscriptions, error } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").in("user_id", [...new Set(eligible)]);
  if (error || !subscriptions?.length) return;
  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: payload.title, body: payload.body, href: payload.href }), { TTL: 86400 });
    } catch (error: unknown) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await db.from("push_subscriptions").delete().eq("id", subscription.id);
      else console.error("Unable to send push notification", error);
    }
  }));
}
