export const notificationOptions = [
  ["complaint_created", "New complaint / cleaner report"],
  ["job_assigned", "Maintenance job assigned / transferred"],
  ["tenant_not_available", "Tenant not available"],
  ["job_completed", "Maintenance job completed"],
  ["appointment_updated", "Appointment updated"],
  ["checkout_assigned", "Check-out room assigned"],
  ["checkout_completed", "Check-out work completed"],
  ["daily_task_assigned", "Daily Task assigned"],
  ["admin_task_assigned", "Admin Task assigned"],
  ["operation_task_assigned", "Operation Task assigned"],
  ["housekeeping_task_assigned", "Housekeeping Task assigned"],
  ["daily_task_reminder", "Daily Task reminder at 9 AM"],
  ["daily_task_completed", "Daily Task completed"],
  ["admin_task_completed", "Admin Task completed"],
  ["operation_task_completed", "Operation Task completed"],
  ["housekeeping_task_completed", "Housekeeping Task completed"],
  ["calendar_event", "Calendar event"],
  ["material_request", "New material request"],
  ["material_decision", "Material approved / rejected"],
  ["google_form_sync_failed", "Google Form sync failed"],
  ["google_form_sync_recovered", "Google Form sync recovered"],
  ["inventory_sync_failed", "Inventory sync failed"],
  ["inventory_sync_recovered", "Inventory sync recovered"],
] as const;
export type NotificationKey = typeof notificationOptions[number][0];
export type PushPreferences = { user_id: string; enabled: boolean; events: Partial<Record<NotificationKey, boolean>> };
export function phoneNotificationEnabled(preference: PushPreferences | undefined, type: NotificationKey) {
  return preference?.enabled !== false && preference?.events[type] !== false;
}
export function taskPushKey(category: string | null, action: "assigned" | "completed"): NotificationKey {
  return category === "admin" || category === "operation" || category === "housekeeping" ? `${category}_task_${action}` : `daily_task_${action}`;
}
