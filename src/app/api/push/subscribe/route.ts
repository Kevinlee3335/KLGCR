import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";

export async function GET() {
  const publicKey = vapidPublicKey();
  return publicKey ? NextResponse.json({ publicKey }) : NextResponse.json({ error: "Push notifications are not configured." }, { status: 503 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!vapidPublicKey()) return NextResponse.json({ error: "Push notifications are not configured." }, { status: 503 });
  const subscription = await request.json().catch(() => null) as PushSubscriptionJSON | null;
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert({ user_id: user.id, endpoint, p256dh, auth, user_agent: request.headers.get("user-agent"), updated_at: new Date().toISOString() }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
