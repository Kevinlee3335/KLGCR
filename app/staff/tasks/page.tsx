import { ClipboardList } from "lucide-react"
import { PlaceholderPage } from "@/components/dashboard-bits"

export default function Page() {
  return (
    <PlaceholderPage
      icon={ClipboardList}
      title="My Tasks"
      description="Your assigned tasks will appear here in a later phase."
    />
  )
}
