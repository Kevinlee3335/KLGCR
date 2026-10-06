export const dailyTaskCategories = ["admin", "operation", "housekeeping"] as const;
export type DailyTaskCategory = (typeof dailyTaskCategories)[number];

export const dailyTaskCategoryLabel: Record<DailyTaskCategory, string> = {
  admin: "Admin Task",
  operation: "Operation Task",
  housekeeping: "Housekeeping Task",
};
