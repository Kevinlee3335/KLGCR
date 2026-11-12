import { sendPushNotifications } from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

type ExpiryPush = {
  id: string;
  recipient_id: string;
  title: string;
  body: string;
  href: string;
  expires_at: string;
};

async function deliverExpiryPush(db: ReturnType<typeof createAdminClient>, event: ExpiryPush, token: string) {
  let result: { delivered_at?: string; locked_until?: null; last_error: string | null };
  try {
    await sendPushNotifications({
      recipientIds: [event.recipient_id],
      title: event.title,
      body: event.body,
      href: event.href,
      expiresAt: event.expires_at,
      tag: `compliance-expiry-${event.id}`,
      strict: true,
      requireSubscription: true,
    });
    result = { delivered_at: new Date().toISOString(), locked_until: null, last_error: null };
  } catch {
    // Keep the lease so a failed device does not monopolize the current batch loop.
    result = { last_error: "Phone alert pending. Check the device subscription." };
  }
  const { error } = await db.from("compliance_expiry_push_outbox").update(result)
    .eq("id", event.id).eq("claim_token", token);
  if (error) console.error("Unable to record compliance reminder delivery", error.message);
}

export async function dispatchComplianceExpiryReminders() {
  const db = createAdminClient();
  const queued = await db.rpc("queue_compliance_expiry_reminders");
  if (queued.error) throw new Error(queued.error.message);

  for (;;) {
    const token = crypto.randomUUID();
    const claimed = await db.rpc("claim_compliance_expiry_pushes", { p_token: token });
    if (claimed.error) throw new Error(claimed.error.message);
    const events = (claimed.data ?? []) as ExpiryPush[];
    if (!events.length) return;

    const attempts = await Promise.allSettled(events.map(event => deliverExpiryPush(db, event, token)));
    for (const attempt of attempts) {
      if (attempt.status === "rejected") console.error("Unable to save a compliance reminder attempt", attempt.reason);
    }
  }
}
