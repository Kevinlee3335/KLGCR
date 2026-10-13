import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { previewEnabled } from "@/lib/ai-assistant";
import AiAssistantClient from "./ui";
export const dynamic = "force-dynamic";
export default async function AiAssistantPage() {
  if (!previewEnabled()) notFound();
  const profile = await requireRole(["admin", "management_viewer"]);
  return <AppShell profile={profile} title="AI Assistant"><AiAssistantClient /></AppShell>;
}
