export type LoginProfile = {
  role: "admin" | "maintenance_staff" | "management_viewer";
  is_active: boolean;
};

export type ProfileAccessResult =
  | { status: "active"; profile: LoginProfile }
  | { status: "disabled" }
  | { status: "missing" }
  | { status: "lookup_failed" };

/** Keep a missing/failed lookup distinct from an explicitly disabled profile. */
export function classifyProfileAccess(
  profile: LoginProfile | null,
  lookupError: unknown,
): ProfileAccessResult {
  if (lookupError) return { status: "lookup_failed" };
  if (!profile) return { status: "missing" };
  if (profile.is_active !== true) return { status: "disabled" };
  return { status: "active", profile };
}
