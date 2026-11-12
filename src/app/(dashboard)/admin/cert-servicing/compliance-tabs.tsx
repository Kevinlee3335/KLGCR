import { BadgeCheck, FileSignature, Wrench } from "lucide-react";
import Link from "next/link";
import { sectionPath, sections, type ComplianceSection } from "./record-model";
import styles from "./compliance-list.module.css";

const sectionIcons = {
  certificate_license: BadgeCheck,
  servicing: Wrench,
  agreement: FileSignature,
};

export function ComplianceTabs({ active, supplierDocumentId, sourceMessageId }: { active: ComplianceSection; supplierDocumentId?: string; sourceMessageId?: string }) {
  return (
    <nav className={styles.tabs} aria-label="Cert & Servicing sections">
      {sections.map(section => {
        const Icon = sectionIcons[section.kind];
        return (
          <Link
            key={section.slug}
            href={sectionPath(section, supplierDocumentId, sourceMessageId)}
            aria-current={section.slug === active.slug ? "page" : undefined}
          >
            <Icon size={16} aria-hidden="true" />
            {section.title}
          </Link>
        );
      })}
    </nav>
  );
}
