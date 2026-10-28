import {BILLING_APPROVER_ID} from "@/lib/billing-approval";
import {loadBillingPreviewData} from "@/lib/billing-preview-data";
import "./billing.css";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BillingPanel } from "@/components/billing-panel";
import { requireRole } from "@/lib/auth";
import { billingPreviewEnabled } from "@/lib/billing-preview";
export default async function BillingPage(){if(!billingPreviewEnabled())notFound();const profile=await requireRole(["admin","management_viewer"]);const initialData=await loadBillingPreviewData().catch(()=>undefined);return <AppShell profile={profile} title="Rental & Utilities"><p><a href="/admin/billing/print-agent">Office printer · KLG Print Agent</a></p><BillingPanel initialData={initialData} createdBy={profile.full_name} approver={profile.id===BILLING_APPROVER_ID&&profile.role==="admin"}/></AppShell>}
