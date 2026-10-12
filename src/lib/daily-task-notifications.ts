import { taskPushKey } from "@/lib/notification-preferences";
import { createAppNotifications, notifyActiveAdmins } from "@/lib/app-notifications";
import { createAdminClient } from "@/lib/supabase/admin";

export function dailyTaskNotificationHref(role: string, category: string | null, date: string, taskId?: number) {
  return role === "admin" || role === "management_viewer"
    ? `/admin/daily-tasks?date=${encodeURIComponent(date)}${category ? `&category=${encodeURIComponent(category)}` : ""}`
    : taskId ? `/staff/daily-tasks/${taskId}` : "/staff/daily-tasks";
}

export async function notifyDailyTaskAssigned(input: { recipientId: string; title: string; date: string; category: string | null; taskId?: number; repeating?: boolean; reminder?: boolean }) {
  const db = createAdminClient();
  const { data: profile, error } = await db.from("profiles").select("role").eq("id", input.recipientId).eq("is_active", true).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) return;
  await createAppNotifications({
    recipientIds: [input.recipientId], type: "daily_task_assigned",
    pushType: input.reminder ? "daily_task_reminder" : taskPushKey(input.category, "assigned"),
    title: input.reminder ? "Daily task due today" : input.repeating ? "Repeating daily task assigned" : "New daily task assigned",
    body: input.reminder ? input.title : `${input.title} ${input.repeating ? "repeats from" : "is due on"} ${input.date}.`,
    href: dailyTaskNotificationHref(profile.role, input.category, input.date, input.taskId), entityId: null,
  });
}

export type DailyTaskNotificationRecord = { id: number; title: string; status: string; task_date: string; task_category: string | null };

// Call only after a successful status change; duplicate completion submissions
// do not create another alert. Numeric task IDs must not go in entity_id (UUID).
export async function notifyDailyTaskCompleted(task: DailyTaskNotificationRecord | null, actorName: string) {
  if (!task || task.status === "completed") return;
  await notifyActiveAdmins({
    type: "daily_task_completed", pushType: taskPushKey(task.task_category, "completed"), title: "Daily task completed",
    body: `${actorName} completed: ${task.title}`,
    href: dailyTaskNotificationHref("admin", task.task_category, task.task_date),
    entityId: null,
  });
}
