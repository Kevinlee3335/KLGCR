import { AppShell } from "@/components/app-shell";
import { ComplaintForm } from "@/components/complaint-form";
import { requireRole } from "@/lib/auth";
import { loadComplaintBlocks } from "@/lib/complaint-blocks.server";

export default async function NewComplaint({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [profile, query] = await Promise.all([requireRole(["admin"]), searchParams]);
  return <AppShell profile={profile} title="Manual Complaint"><div className="page-narrow">
    <h2>Create complaint</h2><p className="subtle">Record a request received outside the future Google Form import.</p>
    {query.error && <p className="error">{query.error}</p>}
    <ComplaintForm blocks={loadComplaintBlocks()} mode="create"/>
  </div></AppShell>;
}
