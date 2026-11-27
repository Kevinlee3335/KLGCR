import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StaffJobList } from "@/components/staff-job-list";
import { requireRole } from "@/lib/auth";
import { jobStatuses, titleCase } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";
import { readStaffJobs } from "@/lib/staff-job-list";

export default async function Tasks({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const [profile, filters] = await Promise.all([requireRole(["maintenance_staff"]), searchParams]);
  const page = /^[1-9]\d{0,6}$/.test(filters.page ?? "") ? Number(filters.page) : 1;
  return <AppShell profile={profile} title="Maintenance Reports">
    <div className="section-head"><div><h2>{filters.status ? titleCase(filters.status) : "Current maintenance reports"}</h2><p className="subtle">Only jobs assigned to you appear here.</p></div></div>
    <form className="panel filter-bar"><select name="status" defaultValue={filters.status || ""}><option value="">Current reports</option>{jobStatuses.map(status => <option key={status} value={status}>{titleCase(status)}</option>)}</select><button className="button">Filter</button></form>
    <section className="panel list-panel"><Suspense key={JSON.stringify([filters.status, page])} fallback={<p className="subtle" role="status">Loading maintenance reports…</p>}>
      <JobResults staffId={profile.id} status={filters.status} page={page}/>
    </Suspense></section>
  </AppShell>;
}

async function JobResults({ staffId, status, page }: { staffId: string; status?: string; page: number }) {
  const { rows, appointments, error, hasNext } = await readStaffJobs(await createClient(), staffId, { status, page });
  function href(number: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (number > 1) params.set("page", String(number));
    return "/staff/tasks" + (params.size ? "?" + params : "");
  }
  if (error) return <p className="error">{error.message}</p>;
  return <><StaffJobList rows={rows} appointments={appointments} viewerId={staffId} returnTo={href(page)}/>
    {(page > 1 || hasNext) && <nav className="actions" aria-label="Maintenance report pages">
      {page > 1 && <a className="button secondary" href={href(page - 1)}>Previous</a>}
      <span>Page {page}</span>
      {hasNext && <a className="button secondary" href={href(page + 1)}>Next</a>}
    </nav>}
  </>;
}
