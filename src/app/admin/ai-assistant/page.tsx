import { requireRole } from "@/lib/auth";
import AiAssistantClient from "./ui";
export default async function AiAssistantPage() {
  await requireRole(["admin", "management_viewer"]);
  return <AiAssistantClient />;
}
