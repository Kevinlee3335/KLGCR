import { describe, expect, it } from "vitest";
import { unresolvedTenantNoShows, type TenantNoShowNotification } from "./admin-notifications";

function noShow(overrides: Partial<TenantNoShowNotification> = {}): TenantNoShowNotification {
  return {
    id: "appointment-1",
    job_id: "job-1",
    appointment_date: "2026-09-14",
    appointment_time: "10:30:00",
    attended_at: "2026-09-14T02:30:00Z",
    no_show_remarks: null,
    attendee: { full_name: "Abdullah" },
    job: { id: "job-1", job_no: "JOB-2026-0032", status: "assigned", room_no: "111", block: { code: "A" } },
    ...overrides,
  };
}

describe("unresolvedTenantNoShows", () => {
  it("keeps an open no-show until Admin reschedules it", () => {
    expect(unresolvedTenantNoShows([noShow()], [])).toHaveLength(1);
    expect(unresolvedTenantNoShows([noShow()], ["job-1"])).toHaveLength(0);
  });

  it("hides completed jobs and duplicate no-show history for the same job", () => {
    const older = noShow({ id: "appointment-old", attended_at: "2026-09-13T02:30:00Z" });
    const completed = noShow({ id: "appointment-completed", job_id: "job-2", job: { id: "job-2", job_no: "JOB-2026-0033", status: "completed", room_no: "112", block: { code: "A" } } });

    expect(unresolvedTenantNoShows([noShow(), older, completed], [])).toEqual([noShow()]);
  });
});
