export const dailyTaskCategories = ["admin", "operation", "housekeeping"] as const;
export type DailyTaskCategory = (typeof dailyTaskCategories)[number];

export const dailyTaskCategoryLabel: Record<DailyTaskCategory, string> = {
  admin: "Admin Task",
  operation: "Operation Task",
  housekeeping: "Housekeeping Task",
};

// Keep explicit departments, including employees whose department differs from
// their login role. Older/newly created profiles may not have the field yet.
export function resolveDailyTaskCategory(employee: {
  daily_task_category?: string | null;
  role?: string | null;
  full_name?: string | null;
}): DailyTaskCategory | null {
  const category = employee.daily_task_category;
  if (dailyTaskCategories.includes(category as DailyTaskCategory)) {
    return category as DailyTaskCategory;
  }
  if (employee.role === "cleaner") return "housekeeping";
  if (employee.role === "maintenance_staff") return "operation";
  if (employee.role === "admin" || employee.role === "management_viewer") {
    const name = employee.full_name?.trim().toLowerCase();
    return name === "kevin lee" || name === "fikri" ? "operation" : "admin";
  }
  return null;
}
