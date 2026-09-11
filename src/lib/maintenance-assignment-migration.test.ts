import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/202609110003_maintenance_assignment_settings.sql"), "utf8");
const foundation = readFileSync(join(process.cwd(), "supabase/migrations/202608240001_phase1_foundation.sql"), "utf8");

describe("maintenance assignment database security", () => {
  it("only allows an admin to replace profile_blocks", () => {
    expect(sql).toContain("if not public.is_admin()");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("revoke all on function public.replace_maintenance_assignment_blocks(jsonb) from public, anon");
  });

  it("retains assigned-job ownership in staff RLS", () => {
    const phase2 = readFileSync(join(process.cwd(), "supabase/migrations/202608260001_phase2_complaints_jobs.sql"), "utf8");
    expect(phase2).toContain("assigned_to=auth.uid()");
    expect(foundation).toContain('create policy "admins manage assignments"');
  });
});
