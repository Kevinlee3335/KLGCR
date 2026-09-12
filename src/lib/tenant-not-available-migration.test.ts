import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/202609120001_tenant_not_available.sql", "utf8");
describe("tenant not available migration", () => {
  it("authorizes by actual ownership and leaves the job open", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("j.assigned_to = p.id");
    expect(sql).toContain("p.id = auth.uid()");
    expect(sql).toContain("status = 'no_show'");
    expect(sql).not.toMatch(/update public\.maintenance_jobs/);
  });
  it("records actor, time, remarks and only updates an actionable current appointment", () => {
    expect(sql).toContain("attended_by = auth.uid()");
    expect(sql).toContain("attended_at = v_now");
    expect(sql).toContain("no_show_remarks = nullif");
    expect(sql).toContain("a.status in ('pending_confirmation', 'confirmed')");
    expect(sql).toContain("order by a.created_at desc");
  });
});
