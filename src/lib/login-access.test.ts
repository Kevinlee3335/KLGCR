import { describe, expect, it } from "vitest";
import { classifyProfileAccess } from "./login-access";

describe("classifyProfileAccess", () => {
  it("accepts an explicitly active profile", () => {
    expect(classifyProfileAccess({ role: "admin", is_active: true }, null).status).toBe("active");
  });

  it("does not misreport a failed or empty lookup as disabled", () => {
    expect(classifyProfileAccess(null, new Error("multiple rows"))).toEqual({ status: "lookup_failed" });
    expect(classifyProfileAccess(null, null)).toEqual({ status: "missing" });
  });

  it("only reports disabled for an explicit false value", () => {
    expect(classifyProfileAccess({ role: "maintenance_staff", is_active: false }, null)).toEqual({ status: "disabled" });
  });
});
