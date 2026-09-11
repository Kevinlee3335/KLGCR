export const maintenanceBlockCodes = ["A", "B", "C", "D"] as const;

export type MaintenanceBlockCode = (typeof maintenanceBlockCodes)[number];

export type MaintenanceAssignment = {
  profileId: string;
  blocks: MaintenanceBlockCode[];
};

/** A staff member is eligible only when active, in the maintenance role, and explicitly permitted for the block. */
export function isEligibleMaintenanceAssignee(
  staff: { role: string; isActive: boolean; blocks: readonly string[] },
  block: MaintenanceBlockCode,
) {
  return staff.role === "maintenance_staff" && staff.isActive && staff.blocks.includes(block);
}

/** Block permission is an additional guard; it never replaces ownership of a job. */
export function canMaintenanceStaffAccessJob(
  staffId: string,
  job: { assignedTo: string; block: MaintenanceBlockCode },
  permittedBlocks: readonly string[],
) {
  return job.assignedTo === staffId && permittedBlocks.includes(job.block);
}
