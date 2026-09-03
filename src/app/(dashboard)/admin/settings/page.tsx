import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";

export default async function SettingsPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const isAdmin = profile.role === "admin";
  return (
    <AppShell profile={profile} title="Settings">
      <div className="page-head">
        <span className="eyebrow">Configuration</span>
        <h2>Settings &amp; Integrations</h2>
        <p className="subtitle">Manage connected services and operational utilities.</p>
      </div>

      <section className="grid-2" style={{ alignItems: "start" }}>
        <article className="panel">
          <div className="section-head" style={{ marginBottom: 12 }}>
            <div>
              <span className="eyebrow">Integration</span>
              <h3 style={{ margin: "6px 0 0" }}>Google Form / Google Integration</h3>
            </div>
            <span className="status-badge status-completed">Active</span>
          </div>
          <p className="subtle">
            Google Form submissions flow automatically into <strong>New Complaints</strong> for Admin review — no
            manual import is needed for normal submissions.
          </p>
          <p className="subtle" style={{ marginTop: 10 }}>
            Google Form → Google Sheet → automatic integration → New Complaint → Admin review.
          </p>
          {isAdmin && (
            <div className="actions" style={{ marginTop: 16 }}>
              <Link className="button secondary button-link" href="/admin/import">
                Open manual import (fallback)
              </Link>
            </div>
          )}
          <p className="subtle" style={{ marginTop: 12, fontSize: ".8rem" }}>
            The manual import remains available as a fallback utility for CSV or pasted rows.
          </p>
        </article>

        <article className="panel">
          <span className="eyebrow">Workspace</span>
          <h3 style={{ margin: "6px 0 14px" }}>Account</h3>
          <div className="detail-grid" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <span>Signed in as</span>
              <strong>{profile.full_name}</strong>
            </div>
            <div>
              <span>Assigned blocks</span>
              <strong>{profile.blocks?.map((b) => `Block ${b.code}`).join(" · ") || "All blocks"}</strong>
            </div>
          </div>
        </article>
      </section>
    </AppShell>
  );
}
