import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { BillingPanel } from "@/components/billing-panel";
import { requireRole } from "@/lib/auth";
import { BILLING_APPROVER_ID } from "@/lib/billing-approval";
import { loadBillingOverview } from "@/lib/billing-preview-data";
import { billingPreviewEnabled } from "@/lib/billing-preview";
import "./billing.css";

async function BillingContent({ name, approver, canManageMail }: { name: string; approver: boolean; canManageMail: boolean }) {
  const initialData = await loadBillingOverview(approver).catch(() => undefined);
  return <BillingPanel initialData={initialData} createdBy={name} approver={approver} canManageMail={canManageMail} />;
}

export default async function BillingPage() {
  if (!billingPreviewEnabled()) notFound();
  const profile = await requireRole(["admin", "management_viewer"]);
  const isAdmin = profile.role === "admin";
  const approver = isAdmin && profile.id === BILLING_APPROVER_ID;

  return (
    <AppShell profile={profile} title="Rental & Utilities">
      <p>
        <a href="/admin/billing/print-agent">Office printer · KLG Print Agent</a>
        {isAdmin && <> · <a href="/admin/billing/customer-invoices">Customer invoice packages</a></>}
      </p>
      <Suspense fallback={<div className="card" role="status">Loading billing…</div>}>
        <BillingContent name={profile.full_name} approver={approver} canManageMail={isAdmin} />
      </Suspense>
    </AppShell>
  );
}
