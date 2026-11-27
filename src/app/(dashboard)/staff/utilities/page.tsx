import {redirect,notFound} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {UtilityPhotoPanel} from "@/components/utility-photo-panel";
import {getSessionProfile} from "@/lib/auth";
import { Suspense } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { listUtilityPhotos } from "@/lib/utility-photo-list";
import {billingPreviewEnabled, malaysiaClock} from "@/lib/billing-preview";
import {canCaptureUtilityPhotos} from "@/lib/utility-photo-access";
import {roleHome} from "@/lib/types";
import "../../admin/billing/billing.css";
export default async function UtilitiesPage(){const profile=await getSessionProfile();if(!profile)redirect("/login");if(!billingPreviewEnabled())notFound();if(!canCaptureUtilityPhotos(profile))redirect(roleHome(profile.role));return <AppShell profile={profile} title="Utilities"><Suspense fallback={<p className="subtle" role="status">Loading meter accounts…</p>}><MeterAccounts/></Suspense></AppShell>}

async function MeterAccounts() {
  // Month rollover stays in the existing authenticated API on a real visit.
  const currentMonth = malaysiaClock().date.slice(0, 7);
  try {
    const snapshot = await listUtilityPhotos(createAdminClient(), null, null);
    return <UtilityPhotoPanel initial={snapshot.period >= currentMonth ? snapshot : null}/>;
  } catch {
    return <UtilityPhotoPanel/>;
  }
}
