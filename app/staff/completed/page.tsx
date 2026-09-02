import { CheckCircle2 } from "lucide-react"
import { PlaceholderPage } from "@/components/dashboard-bits"

export default function Page() {
  return (
    <PlaceholderPage
      icon={CheckCircle2}
      title="Completed Jobs"
      description="Your completed jobs history will be available in a later phase."
    />
  )
}
