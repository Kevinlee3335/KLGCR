import { FileWarning } from "lucide-react"
import { PlaceholderPage } from "@/components/dashboard-bits"

export default function Page() {
  return (
    <PlaceholderPage
      icon={FileWarning}
      title="New Complaints"
      description="Complaint intake and triage will be available in a later phase."
    />
  )
}
