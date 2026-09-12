import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/app/api/google-form/webhook/route.ts", "utf8");
describe("Google Form webhook email plumbing", () => {
  it("maps EMAIL ADDRESS to reporter_email and only writes production availability fields", () => {
    expect(route).toContain('formValue(body, "EMAIL ADDRESS", "Email Address")');
    expect(route).toContain("reporter_email: reporterEmail || null");
    expect(route).toContain("availability_date: availabilityDate");
    expect(route).toContain("availability_time: availabilityTime");
    expect(route).not.toMatch(/\bpreferred_date\s*:/);
    expect(route).not.toMatch(/\bpreferred_time\s*:/);
  });

  it("sends a receipt after successful insertion and returns duplicate retries before sending", () => {
    const insert = route.indexOf('.from("complaints").insert(payload)');
    const duplicate = route.indexOf('error.code === "23505"');
    const send = route.indexOf("sendTransactionalEmail(reporterEmail");
    expect(insert).toBeGreaterThan(-1);
    expect(duplicate).toBeGreaterThan(insert);
    expect(send).toBeGreaterThan(duplicate);
  });
});
