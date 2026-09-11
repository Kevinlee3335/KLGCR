import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609110001_final_appointment_architecture_repair.sql", "utf8");

describe("final appointment production repair", () => {
  it("is additive and creates or repairs the appointment architecture", () => {
    expect(sql).toMatch(/create table if not exists public\.appointments/i);
    expect(sql).toContain("appointments_one_active_per_job_idx");
    expect(sql).toContain("appointments_updated_at");
    expect(sql).toContain("sync_appointment_job_schedule");
    expect(sql).toContain('drop trigger if exists enforce_appointment_required');
  });

  it("defines one atomic assignment RPC with the final YES and NO rules", () => {
    expect(sql).toContain("assign_complaint_with_schedule");
    expect(sql).toMatch(/for update/);
    expect(sql).toContain("v_access='no' and p_appointment_date is null");
    expect(sql).toContain("(p_appointment_date is null)<>(p_appointment_time is null)");
    expect(sql).toMatch(/if p_appointment_date is not null then\s+insert into public\.appointments/);
    expect(sql).not.toMatch(/drop function if exists public\.assign_complaint\(uuid,uuid\)/);
  });

  it("keeps staff visibility scoped to the assigned staff member and block", () => {
    expect(sql).toContain("assigned_staff=auth.uid()");
    expect(sql).toContain("pb.profile_id=auth.uid()");
    expect(sql).toContain("j.assigned_to=auth.uid()");
  });
});
