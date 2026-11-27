import { DirectPageLink } from "@/components/direct-page-link";
import { ArrowRight, FileUp, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BillingPanel } from "@/components/billing-panel";
import { requireRole } from "@/lib/auth";
import { BILLING_APPROVER_ID } from "@/lib/billing-approval";
import { loadBillingSettings, loadPendingBillingCount } from "@/lib/billing-preview-data";
import { billingPreviewEnabled } from "@/lib/billing-preview";
import "./billing.css";

async function BillingContent({ name, approver, canManageMail }: { name: string; approver: boolean; canManageMail: boolean }) {
  const settings = loadBillingSettings().catch(() => undefined);
  const pending = approver ? loadPendingBillingCount().catch(() => null) : null;
  const data = await settings;
  const initialData = data ? {...data, pendingPackCount: approver ? null : 0} : undefined;
  return <BillingPanel initialData={initialData} initialPendingCount={pending && <Suspense fallback="…"><PendingCount count={pending}/></Suspense>} createdBy={name} approver={approver} canManageMail={canManageMail} />;
}

async function PendingCount({count}: {count: Promise<number | null>}) {
  return (await count) ?? "—";
}

export default async function BillingPage() {
  if (!billingPreviewEnabled()) notFound();
  const profile = await requireRole(["admin", "management_viewer"]);
  const isAdmin = profile.role === "admin";
  const approver = isAdmin && profile.id === BILLING_APPROVER_ID;

  return (
    <AppShell profile={profile} title="Rental & Utilities">
      <nav className="billing-module billing-page-links" aria-label="Billing tools">
        {isAdmin && (
          <DirectPageLink className="billing-page-link billing-page-link-primary" href="/admin/billing/customer-invoices">
            <FileUp size={18} aria-hidden="true" />
            Customer invoice packages
            <ArrowRight size={16} aria-hidden="true" />
          </DirectPageLink>
        )}
        <DirectPageLink className="billing-page-link" href="/admin/billing/print-agent">
          <Printer size={17} aria-hidden="true" />
          Office printer
        </DirectPageLink>
      </nav>
      <Suspense fallback={<div className="card" role="status">Loading billing…</div>}>
        <BillingContent name={profile.full_name} approver={approver} canManageMail={isAdmin} />
      </Suspense>
    </AppShell>
  );
}
