import { describe, expect, it } from "vitest";
import { canMaintenanceStaffAccessJob, isEligibleMaintenanceAssignee, maintenanceBlockCodes } from "./maintenance-assignments";

describe("maintenance assignment eligibility", () => {
  it("allows both configured staff to be eligible for every block", () => {
    const staff = ["Abdullah", "Faiz"].map((name) => ({ name, role: "maintenance_staff", isActive: true, blocks: maintenanceBlockCodes }));
    for (const block of maintenanceBlockCodes) expect(staff.filter((member) => isEligibleMaintenanceAssignee(member, block)).map(({ name }) => name)).toEqual(["Abdullah", "Faiz"]);
  });

  it("still requires the job to be assigned to the logged-in staff member", () => {
    expect(canMaintenanceStaffAccessJob("abdullah", { assignedTo: "faiz", block: "A" }, maintenanceBlockCodes)).toBe(false);
    expect(canMaintenanceStaffAccessJob("abdullah", { assignedTo: "abdullah", block: "A" }, maintenanceBlockCodes)).toBe(true);
  });
});
