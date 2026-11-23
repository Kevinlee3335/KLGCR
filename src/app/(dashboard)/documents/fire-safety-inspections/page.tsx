import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import {
  FIRE_SAFETY_ARCHIVE_PATH,
  FIRE_SAFETY_ARCHIVE_ROLES,
  FIRE_SAFETY_ARCHIVE_TITLE,
  fireSafetyArchiveFolders,
} from "@/lib/fire-safety-inspection-folders";
import "../documents.css";
import "../records.css";

export default async function FireSafetyInspectionsPage() {
  const profile = await requireRole(FIRE_SAFETY_ARCHIVE_ROLES);

  return <AppShell profile={profile} title="Fire Safety Inspection Archive">
    <div className="business-documents">
      <Link className="business-document-back" href="/documents">← Documents</Link>
      <header>
        <div>
          <h2>{FIRE_SAFETY_ARCHIVE_TITLE}</h2>
          <p>Choose a block folder to view or download completed inspection PDFs.</p>
        </div>
      </header>
      <div className="documents-categories" role="navigation" aria-label="Inspection folders"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 15rem), 1fr))" }}>
        {Object.entries(fireSafetyArchiveFolders).map(([scope, label]) => (
          <Link className="documents-company-folder" key={scope} href={`${FIRE_SAFETY_ARCHIVE_PATH}/${scope}`}>
            <FolderOpen size={20} aria-hidden />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </div>
  </AppShell>;
}
