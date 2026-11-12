import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchivePicker } from "./record-documents";
import type { ArchiveChoice, ComplianceCycle, ComplianceRecord } from "../../record-model";

vi.mock("../../actions", () => ({
  linkComplianceDocument: vi.fn(),
  retryComplianceDelivery: vi.fn(),
  reviewComplianceDocument: vi.fn(),
}));

const record: ComplianceRecord = {
  id: "record", record_type: "certificate_license", title: "Fire extinguishers", provider: "Supplier",
  reference_no: null, last_completed_date: null, next_due_date: "2026-10-27", status: "active",
  frequency: null, contact_name: null, contact_phone: null, contact_email: null, notes: null,
  location: "Block D", supplier_key: "supplier", required_evidence: ["invoice"], template_row: null,
};
const cycle: ComplianceCycle = {
  id: "cycle", record_id: record.id, due_date: record.next_due_date, original_due_date: record.next_due_date,
  effective_date: null, completed_at: null, performed_on: null, next_due_date: null, next_effective_date: null,
  requires_invoice: false, required_evidence: null, notes: null, status: "open", created_at: "2026-11-12T08:00:00Z",
};
const source = { id: "abcd12345678", subject: "Invoice", received_at: "2026-11-12T08:00:00Z" };
const invoice: ArchiveChoice = {
  id: "invoice", company: "supplier", file_name: "Invoice.pdf", folder: "Invoice",
  created_at: source.received_at, email: source, emails: [source],
};
const common = { record, cycle, suppliers: [], searchTerm: "", allSuppliers: false, loadError: false };

describe("supplier PDF picker", () => {
  it("carries the exact source email and cycle when opened from a Gmail attachment", () => {
    render(<ArchivePicker {...common} candidates={[invoice]} selectedArchive={invoice.id} sourceMessageId={source.id} />);
    const form = screen.getByRole("button", { name: "Link to this cycle" }).closest("form")!;
    const values = new FormData(form);
    expect(values.get("recordId")).toBe(record.id);
    expect(values.get("cycleId")).toBe(cycle.id);
    expect(values.get("supplierDocumentId")).toBe(invoice.id);
    expect(values.get("sourceMessageId")).toBe(source.id);
    expect(values.get("kind")).toBe("invoice");
    expect(screen.getByRole("link", { name: "Source email" })).toHaveAttribute("href", "/documents/suppliers/supplier/emails/abcd12345678");
  });

  it("requires choosing a kind when search results contain more than one PDF", () => {
    const report = { ...invoice, id: "report", file_name: "Service report.pdf", folder: "Service Report" };
    render(<ArchivePicker {...common} searchTerm="PDF" candidates={[invoice, report]} />);
    expect(screen.getByRole("combobox", { name: "File as" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "File as" })).toBeRequired();
  });
});
