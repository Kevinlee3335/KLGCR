import { jobStatuses } from "@/lib/phase2";

/** Only staff-owned destinations may be used after a job is completed. */
export function staffJobReturnTo(value: unknown, fallbackStatus?: string): string {
  if (typeof value === "string") {
    if (["/staff", "/staff/tasks", "/staff/monitoring", "/staff/appointments"].includes(value)) return value;
    const match = /^\/staff\/tasks\?status=([a-z_]+)$/.exec(value);
    if (match && jobStatuses.some(status => status === match[1])) return value;
  }
  if (fallbackStatus && jobStatuses.some(status => status === fallbackStatus)) return `/staff/tasks?status=${fallbackStatus}`;
  return "/staff/tasks";
}
