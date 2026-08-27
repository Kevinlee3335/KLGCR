export type StaffJobAction = "start" | "complete" | "monitor" | "pending_material" | "resume";

export function availableJobActions(status: string): StaffJobAction[] {
  if (status === "assigned") return ["start"];
  if (status === "in_progress") return ["complete", "monitor", "pending_material"];
  if (status === "under_monitoring") return ["complete", "monitor"];
  if (status === "pending_material") return ["resume", "complete"];
  return [];
}
