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
