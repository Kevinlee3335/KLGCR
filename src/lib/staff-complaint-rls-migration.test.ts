import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609110002_staff_complaint_read_policy.sql", "utf8");

describe("staff complaint read policy migration", () => {
  it("uses a non-recursive SECURITY DEFINER authorization helper", () => {
    expect(sql).toMatch(/create or replace function public\.staff_can_read_job_complaint\(p_complaint_id uuid\)/i);
    expect(sql).toMatch(/stable\s+security definer\s+set search_path = ''/i);
    expect(sql).toContain("j.complaint_id = p_complaint_id");
  });

  it("matches the existing assigned-job and block authorization model", () => {
    expect(sql).toContain("public.current_role() = 'maintenance_staff'");
    expect(sql).toContain("j.assigned_to = auth.uid()");
    expect(sql).toContain("pb.profile_id = auth.uid()");
    expect(sql).toContain("pb.block_id = j.block_id");
  });

  it("adds only a scoped complaint SELECT policy", () => {
    expect(sql).toMatch(/create policy "staff reads complaints for assigned allowed jobs"[\s\S]*for select[\s\S]*to authenticated[\s\S]*using \(public\.staff_can_read_job_complaint\(id\)\)/i);
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(sql).not.toMatch(/reporter_email/i);
  });
});
