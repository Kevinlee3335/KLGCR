import { AppShell } from "@/components/app-shell";
import { CleanerComplaintForm } from "@/components/cleaner-complaint-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CleanerNewComplaint({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const profile = await requireRole(["cleaner"]);
  const query = await searchParams;
  const supabase = await createClient();
  const { data: blocks } = await supabase.from("blocks").select("id,code").eq("is_active", true).order("code");

  return <AppShell profile={profile} title="New Complaint">
    <div className="cleaner-report-page">
      <header className="cleaner-report-heading"><p className="eyebrow">Cleaner Report</p><h2>Report a Defect</h2><p>Take a photo, identify the location and send it to Admin.</p></header>
      {query.created && <p className="success">Complaint {query.created} was sent to Admin successfully.</p>}
      <CleanerComplaintForm blocks={blocks || []} reporterName={profile.full_name}/>
    </div>
  </AppShell>;
}
