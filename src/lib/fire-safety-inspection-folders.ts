import type { AppRole } from "@/lib/types";

export const FIRE_SAFETY_ARCHIVE_PATH = "/documents/fire-safety-inspections";
export const FIRE_SAFETY_ARCHIVE_TITLE = "Fire Safety Inspections";
export const FIRE_SAFETY_ARCHIVE_ROLES: AppRole[] = ["admin", "management_viewer", "maintenance_staff"];
export const fireSafetyArchiveFolders = { ab: "Block A & B", cd: "Block C & D" };

export type ArchiveScope = keyof typeof fireSafetyArchiveFolders;

export function isFireSafetyArchiveScope(scope: string): scope is ArchiveScope {
  return Object.hasOwn(fireSafetyArchiveFolders, scope);
}
