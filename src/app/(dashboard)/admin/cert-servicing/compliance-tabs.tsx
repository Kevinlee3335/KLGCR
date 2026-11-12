import Link from "next/link";
import { sectionPath, sections, type ComplianceSection } from "./record-model";
import styles from "./compliance.module.css";

export function ComplianceTabs({ active, supplierDocumentId, sourceMessageId }: { active: ComplianceSection; supplierDocumentId?: string; sourceMessageId?: string }) {
  return (
    <nav className={styles.tabs} aria-label="Cert &amp; Servicing sections">
      {sections.map(section => (
        <Link
          key={section.slug}
          href={sectionPath(section, supplierDocumentId, sourceMessageId)}
          aria-current={section.slug === active.slug ? "page" : undefined}
        >
          {section.title}
        </Link>
      ))}
    </nav>
  );
}
