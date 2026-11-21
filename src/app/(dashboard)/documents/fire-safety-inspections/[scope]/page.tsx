import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { listArchivedFireSafetyInspections } from "@/lib/fire-safety-inspection-archive";
import {
  FIRE_SAFETY_ARCHIVE_PATH,
  FIRE_SAFETY_ARCHIVE_ROLES,
  FIRE_SAFETY_ARCHIVE_TITLE,
  fireSafetyArchiveFolders,
  isFireSafetyArchiveScope,
} from "@/lib/fire-safety-inspection-folders";
import { isFlexPreview } from "@/lib/flex-inspection-review-store";
import "../../records.css";

const monthFormat = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  month: "long",
  year: "numeric",
});
const dateFormat = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur",
  dateStyle: "medium",
});

export default async function FireSafetyInspectionFolder({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const profile = await requireRole(FIRE_SAFETY_ARCHIVE_ROLES);
  const { scope } = await params;
  if (!isFireSafetyArchiveScope(scope)) notFound();

  const label = fireSafetyArchiveFolders[scope];
  const preview = isFlexPreview();
  const reports = await listArchivedFireSafetyInspections(scope).catch(() => null);
  return <AppShell profile={profile} title="Fire Safety Inspection Archive">
    <div className="business-documents">
      <Link className="business-document-back" href={FIRE_SAFETY_ARCHIVE_PATH}>← {FIRE_SAFETY_ARCHIVE_TITLE}</Link>
      <header><h2>{label}</h2></header>
      <section aria-label={`${label} monthly PDFs`}>
        <h3>Monthly PDFs</h3>
        {preview ? <p>Trial inspections are not saved to Documents.</p> : reports === null ? (
          <p role="alert">Unable to load inspection reports. Please try again.</p>
        ) : reports.length === 0 ? (
          <p>Completed inspections will appear here.</p>
        ) : (
          <div className="business-document-table-wrap">
            <table className="table receipt-document-table">
              <thead>
                <tr><th scope="col">Month</th><th scope="col">Inspection date</th><th scope="col">Inspector</th><th scope="col">PDF</th></tr>
              </thead>
              <tbody>
                {reports.map(report => {
                  const month = monthFormat.format(new Date(`${report.period}-01`));
                  const pdf = `/api/fire-safety-inspection-archive/${scope}/${report.period}`;
                  return <tr key={report.period}>
                    <td data-label="Month"><strong>{month}</strong></td>
                    <td data-label="Inspection date">{dateFormat.format(new Date(report.inspection_date))}</td>
                    <td data-label="Inspector">{report.inspected_by_name ?? "—"}</td>
                    <td data-label="PDF">
                      <div className="receipt-document-actions">
                        <a className="button secondary" href={pdf} target="_blank" rel="noreferrer" aria-label={`View ${month} PDF`}>View PDF</a>
                        <a className="button secondary" href={`${pdf}?download=1`} aria-label={`Download ${month} PDF`}>Download</a>
                      </div>
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  </AppShell>;
}
