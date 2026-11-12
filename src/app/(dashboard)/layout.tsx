import { DashboardNotificationSession } from "@/components/notification-session";

export const preferredRegion = "sin1";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardNotificationSession>{children}</DashboardNotificationSession>;
}
