import { AppShell } from "@/components/app-shell";
import { CleanerDefectReportForm } from "@/components/cleaner-defect-report-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const profile = await requireRole(["cleaner"]);
  const query = await searchParams;
  const db = await createClient();
  const { data: blocks } = await db.from("blocks").select("id,code").eq("is_active", true).order("code");

  return (
    <AppShell profile={profile} title="Report Defect">
      <div className="section-head">
        <div>
          <p className="eyebrow">Daily cleaning report</p>
          <h2>Report a defect</h2>
          <p className="subtle">Report room or common-area problems found during daily cleaning. It goes directly to Admin&apos;s New Complaints.</p>
        </div>
      </div>
      {query.error && <p className="error">{query.error}</p>}
      {query.success && <p className="success">{query.success}</p>}
      <CleanerDefectReportForm blocks={blocks || []} />
    </AppShell>
  );
}
