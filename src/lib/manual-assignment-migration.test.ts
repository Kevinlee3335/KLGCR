import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609110004_manual_assignment_optional_schedule.sql", "utf8");

describe("manual complaint assignment migration", () => {
  it("creates every job but creates an appointment only when a complete schedule is supplied", () => {
    expect(sql).toMatch(/insert into public\.maintenance_jobs/);
    expect(sql).toMatch(/if p_appointment_date is not null then\s+insert into public\.appointments/);
    expect(sql).toContain("(p_appointment_date is null)<>(p_appointment_time is null)");
  });

  it("requires room access and a schedule only for Google Form NO complaints", () => {
    expect(sql).toContain("v_complaint.source<>'manual' and v_access not in ('yes','no')");
    expect(sql).toContain("v_complaint.source<>'manual' and v_access='no' and p_appointment_date is null");
  });

  it("preserves active maintenance staff and profile block eligibility", () => {
    expect(sql).toMatch(/p\.role='maintenance_staff' and p\.is_active and p\.deleted_at is null/);
    expect(sql).toContain("pb.block_id=v_complaint.block_id");
    expect(sql).toContain("p.id=p_assigned_to");
  });
});
