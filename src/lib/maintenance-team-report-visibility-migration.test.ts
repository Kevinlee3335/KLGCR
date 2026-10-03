import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20261003045000_maintenance_team_report_visibility.sql", "utf8");

describe("maintenance team report visibility migration", () => {
  it("allows Maintenance staff to read all maintenance reports without disabling RLS", () => {
    expect(sql).toMatch(/create policy "management reads all jobs; maintenance staff reads all jobs"[\s\S]*public\.current_role\(\) = 'maintenance_staff'/i);
    expect(sql).toMatch(/create policy "maintenance staff reads complaints for visible jobs"/i);
    expect(sql).toMatch(/create policy "maintenance staff reads all appointments"/i);
    expect(sql).not.toMatch(/disable row level security/i);
  });

  it("keeps every job mutation limited to the assigned staff member and supports External Area jobs", () => {
    for (const rpc of ["start_assigned_job", "complete_assigned_job", "monitor_assigned_job", "set_job_pending_material", "resume_assigned_job", "create_material_request"]) {
      expect(sql).toContain(`function public.${rpc}`);
    }
    expect(sql).toContain("j.assigned_to=auth.uid()");
    expect(sql).toContain("j.block_id is null or exists");
  });
});
