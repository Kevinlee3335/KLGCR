import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JobList } from "@/components/phase2-ui";

describe("admin Maintenance Jobs timeline columns", () => {
  it("shows only the requested timeline timestamps on the compact admin list", () => {
    const html = renderToStaticMarkup(<JobList compactDesktopColumns statusFilter={<span>Status filter</span>} rows={[{
      id: "job-1", job_no: "KLGCR-JOB-001", room_no: "A427", category: "Electrical", description: "Light not working",
      priority: "normal", status: "completed", assigned_to: "staff-1", assigned_at: "2026-10-07T02:15:00.000Z",
      started_at: "2026-10-07T03:00:00.000Z", completed_at: "2026-10-07T04:30:00.000Z", updated_at: "2026-10-07T04:30:00.000Z",
      action_taken: null, monitoring_note: null, monitoring_started_at: null, monitoring_review_at: null, pending_material_note: null,
      block: { id: 1, code: "A" }, assignee: { id: "staff-1", full_name: "Abdullah" }, appointments: [],
    }]} />);

    expect(html).toContain("Status filter");
    expect(html).toContain("Assigned");
    expect(html).toContain("In Progress");
    expect(html).toContain("Completed");
    expect(html).toContain("Abdullah");
    expect(html).not.toContain("Complainant");
    expect(html).not.toContain("Appointment");
    expect(html).not.toContain("Updated");
  });
});
