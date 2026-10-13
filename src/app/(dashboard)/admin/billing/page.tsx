import "./billing.css";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BillingPanel } from "@/components/billing-panel";
import { requireRole } from "@/lib/auth";
import { billingPreviewEnabled } from "@/lib/billing-preview";
export default async function BillingPage(){if(!billingPreviewEnabled())notFound();const profile=await requireRole(["admin","management_viewer"]);return <AppShell profile={profile} title="Rental & Utilities"><BillingPanel/></AppShell>}
