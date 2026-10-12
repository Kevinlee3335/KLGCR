import { PhoneNotificationSettings } from "@/components/phone-notification-settings";
import type { PushPreferences } from "@/lib/notification-preferences";
import { AppShell } from "@/components/app-shell";
import { MaintenanceAssignmentForm } from "@/components/maintenance-assignment-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AdminSettingsPage() {
  const profile = await requireRole(["admin"]);
  const db = await createClient();
  const { data, error } = await db.from("profiles")
    .select("id,full_name,profile_blocks(blocks(code))")
    .eq("role", "maintenance_staff").eq("is_active", true).is("deleted_at", null).order("full_name");
  if (error) throw new Error(`Unable to load maintenance assignment settings: ${error.message}`);
  const staff = (data || []).map((member) => ({
    id: member.id,
    full_name: member.full_name,
    blocks: (member.profile_blocks as unknown as { blocks: { code: string } | null }[])
      .flatMap(({ blocks }) => blocks ? [blocks.code] : []),
  }));

  const [{ data: members, error: memberError }, { data: preferences, error: preferenceError }] = await Promise.all([
    db.from("profiles").select("id,full_name,role").eq("is_active", true).is("deleted_at", null).order("full_name"),
    db.from("phone_notification_preferences").select("user_id,enabled,events"),
  ]);
  if (memberError) throw new Error(memberError.message);
  return <AppShell profile={profile} title="Settings">
    {preferenceError ? <section className="panel"><h2>Phone Notification Settings</h2><p className="error">Notification settings are not available yet. Existing phone notifications remain unchanged.</p></section> : <PhoneNotificationSettings members={members || []} preferences={(preferences || []) as PushPreferences[]}/> }
    <div className="section-head"><div><p className="eyebrow">Access control</p><h2>Maintenance Assignment Settings</h2><p className="subtle">Choose which blocks each active maintenance staff member may be assigned to. Admins still choose the assignee for every individual complaint.</p></div></div>
    <section className="panel maintenance-settings-panel">
      <div className="maintenance-settings-note"><strong>Assignment eligibility only</strong><span>Block permission does not expose unassigned jobs or jobs assigned to another staff member.</span></div>
      <MaintenanceAssignmentForm staff={staff}/>
    </section>
  </AppShell>;
}
