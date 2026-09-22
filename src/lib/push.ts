import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = { recipientIds: string[]; title: string; body: string; href: string };

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
  const { data: subscriptions, error } = await db.from("push_subscriptions")
    .select("id,endpoint,p256dh,auth").in("user_id", [...new Set(payload.recipientIds)]);
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
