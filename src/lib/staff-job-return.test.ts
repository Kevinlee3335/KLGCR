import { describe, expect, it } from "vitest";
import { staffJobReturnTo } from "./staff-job-return";

describe("completed job return destination", () => {
  it("returns to the exact staff status category", () => {
    expect(staffJobReturnTo("/staff/tasks?status=pending_material")).toBe("/staff/tasks?status=pending_material");
    expect(staffJobReturnTo("/staff/tasks?status=in_progress")).toBe("/staff/tasks?status=in_progress");
    expect(staffJobReturnTo("/staff/appointments?page=2")).toBe("/staff/appointments?page=2");
    expect(staffJobReturnTo("/staff/appointments?page=2&next=/admin")).toBe("/staff/tasks");
    expect(staffJobReturnTo("/staff/monitoring")).toBe("/staff/monitoring");
    expect(staffJobReturnTo("/staff/tasks?status=completed&page=2")).toBe("/staff/tasks?status=completed&page=2");
    expect(staffJobReturnTo("/staff/tasks?page=2")).toBe("/staff/tasks?page=2");
    expect(staffJobReturnTo(null, "assigned")).toBe("/staff/tasks?status=assigned");
  });

  it("never accepts an external or admin redirect from submitted form data", () => {
    expect(staffJobReturnTo("https://example.com", "in_progress")).toBe("/staff/tasks?status=in_progress");
    expect(staffJobReturnTo("//example.com")).toBe("/staff/tasks");
    expect(staffJobReturnTo("/admin/jobs")).toBe("/staff/tasks");
  });
});
