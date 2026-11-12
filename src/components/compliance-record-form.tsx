import { saveComplianceRecord } from "@/app/(dashboard)/admin/cert-servicing/actions";
import {
  evidenceLabels,
  requiredEvidenceKinds,
  type ComplianceRecord,
  type ComplianceSection,
  type EvidenceKind,
  type SupplierChoice,
} from "@/app/(dashboard)/admin/cert-servicing/record-model";
import styles from "@/app/(dashboard)/admin/cert-servicing/compliance.module.css";
import { Save } from "lucide-react";
import controls from "./compliance-controls.module.css";
import { SubmitButton } from "./submit-button";

const defaultEvidence = {
  certificate_license: "certificate",
  servicing: "service_report",
  agreement: "agreement",
} satisfies Record<ComplianceSection["kind"], EvidenceKind>;

export function ComplianceRecordForm({
  section,
  record,
  effectiveDate,
  suppliers,
}: {
  section: ComplianceSection;
  record?: ComplianceRecord;
  effectiveDate?: string | null;
  suppliers: SupplierChoice[];
}) {
  const required = record?.required_evidence ?? [defaultEvidence[section.kind]];
  return (
    <form action={saveComplianceRecord} className={styles.recordForm}>
      {record && <input type="hidden" name="recordId" value={record.id} />}
      <input type="hidden" name="recordType" value={section.kind} />
      <input type="hidden" name="requiredEvidenceProvided" value="1" />
      <label className={controls.label}>Title<input className={controls.input} name="title" required defaultValue={record?.title} maxLength={200} /></label>
      <label className={controls.label}>Block / Location<input className={controls.input} name="location" defaultValue={record?.location ?? ""} maxLength={200} /></label>
      <label className={controls.label}>Provider<input className={controls.input} name="provider" defaultValue={record?.provider ?? ""} maxLength={200} /></label>
      <label className={controls.label}>Supplier archive
        <select className={controls.select} name="supplierKey" defaultValue={record?.supplier_key ?? ""}>
          <option value="">Select a supplier</option>
          {suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select>
      </label>
      <label className={controls.label}>Reference No.<input className={controls.input} name="referenceNo" defaultValue={record?.reference_no ?? ""} maxLength={120} /></label>
      <label className={controls.label}>Frequency<input className={controls.input} name="frequency" defaultValue={record?.frequency ?? ""} placeholder="Monthly / Yearly" maxLength={100} /></label>
      <label className={controls.label}>Due date<input className={controls.input} name="nextDueDate" type="date" defaultValue={record?.next_due_date ?? ""} /></label>
      {section.kind !== "servicing" && <label className={controls.label}>Effective date<input className={controls.input} name="effectiveDate" type="date" defaultValue={effectiveDate ?? ""} /></label>}
      <label className={controls.label}>Contact name<input className={controls.input} name="contactName" defaultValue={record?.contact_name ?? ""} maxLength={120} /></label>
      <label className={controls.label}>Contact phone<input className={controls.input} name="contactPhone" type="tel" defaultValue={record?.contact_phone ?? ""} maxLength={80} /></label>
      <label className={controls.label}>Contact email<input className={controls.input} name="contactEmail" type="email" defaultValue={record?.contact_email ?? ""} maxLength={254} /></label>
      {record && <label className={controls.label}>Excel print row (optional)<input className={controls.input} name="templateRow" type="number" min={1} max={1048576} defaultValue={record.template_row ?? ""} /></label>}
      <label className={`${controls.label} ${styles.fullSpan}`}>Notes<textarea className={controls.input} name="notes" rows={3} defaultValue={record?.notes ?? ""} maxLength={4000} /></label>
      <fieldset className={`${styles.checks} ${styles.fullSpan}`}>
        <legend>Documents required before Complete</legend>
        {requiredEvidenceKinds.map(kind => {
          const alwaysRequired = kind === "agreement" && section.kind === "agreement";
          return <label key={kind}>
            {alwaysRequired && <input name="requiredEvidence" type="hidden" value={kind} />}
            <input name="requiredEvidence" type="checkbox" value={kind} defaultChecked={alwaysRequired || required.includes(kind)} disabled={alwaysRequired} />
            {evidenceLabels[kind]}
          </label>;
        })}
      </fieldset>
      <div className={styles.actions}><SubmitButton className={`${controls.button} ${controls.primary}`} pendingText="Saving…"><Save className={controls.icon} aria-hidden="true" />{record ? "Save details" : "Add record"}</SubmitButton></div>
    </form>
  );
}
