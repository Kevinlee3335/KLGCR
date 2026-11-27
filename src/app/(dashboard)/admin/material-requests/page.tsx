import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { MaterialRequestResults, type RequestFilters } from "./material-request-results";

type Query = RequestFilters & { error?: string; success?: string };

export default async function AdminMaterialRequestsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const profile = await requireRole(["admin", "management_viewer"]);
  const query = await searchParams;
  return <AppShell profile={profile} title="Material Requests">
    <div className="section-head inventory-heading"><div><p className="eyebrow">Material Control</p><h2>Material Requests</h2><p className="subtle">Review requests, correct or close individual items, and issue materials only when collected.</p></div></div>
    {query.error && <p className="error">{query.error}</p>}
    {query.success && <p className="success">Request updated successfully.</p>}
    <Suspense key={JSON.stringify([query.status, query.page])} fallback={<div className="panel" role="status" aria-busy="true"><p className="subtle">Loading material requests…</p></div>}>
      <MaterialRequestResults isAdmin={profile.role === "admin"} query={query}/>
    </Suspense>
  </AppShell>;
}
