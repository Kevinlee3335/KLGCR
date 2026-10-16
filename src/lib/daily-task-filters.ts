export const taskFilterStatuses = ["pending", "accepted", "in_progress", "completed", "kiv"] as const;
export function taskSearchFilter(value: string | undefined) {
  const text = (value || "").trim().slice(0, 100);
  if (!text) return undefined;
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = JSON.stringify(pattern);
  return `title.ilike.${quoted},notes.ilike.${quoted}`;
}
export function taskFilterDate(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
}

// Completed records stay on the current list only on their completion day in Malaysia.
export function showDailyTaskInDefaultList(task: { status: string; completed_at?: string | null }, today: string) {
  if (task.status !== "completed") return true;
  if (!task.completed_at) return false;
  const completed = new Date(task.completed_at);
  if (Number.isNaN(completed.getTime())) return false;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(completed) === today;
}
