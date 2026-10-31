import {redirect,notFound} from "next/navigation";
import {AppShell} from "@/components/app-shell";
import {UtilityPhotoPanel} from "@/components/utility-photo-panel";
import {getSessionProfile} from "@/lib/auth";
import {billingPreviewEnabled} from "@/lib/billing-preview";
import {canCaptureUtilityPhotos} from "@/lib/utility-photo-access";
import {roleHome} from "@/lib/types";
import "../../admin/billing/billing.css";
export default async function UtilitiesPage(){const profile=await getSessionProfile();if(!profile)redirect("/login");if(!billingPreviewEnabled())notFound();if(!canCaptureUtilityPhotos(profile))redirect(roleHome(profile.role));return <AppShell profile={profile} title="Utilities"><UtilityPhotoPanel/></AppShell>}
