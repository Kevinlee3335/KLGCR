// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { streamPage } from "@/test/stream-page";
import Page from "./page";

const mocks = vi.hoisted(() => ({ role: vi.fn(), db: vi.fn(), suppliers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/supplier-mail/queries", () => ({ listSupplierCompanies: mocks.suppliers }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/compliance-record-form", () => ({ ComplianceRecordForm: ({ suppliers }: { suppliers: {name: string}[] }) => <select>{suppliers.map(({name}) => <option key={name}>{name}</option>)}</select> }));

const archiveId = '10000000-0000-4000-8000-000000000001';
const example = { id: 'cert-one', title: 'Pump Inspection', provider: 'Fixture Services', reference_no: null, location: null,
  status: 'active', next_due_date: '2027-03-20', compliance_cycles: [{ scheduled_on: '2027-03-19', scheduled_time: '14:00:00', schedule_notes: 'Fixture visit' }] };
beforeEach(() => { vi.resetAllMocks(); });
function database(fetch: typeof globalThis.fetch) {
  mocks.db.mockResolvedValue(createClient('https://register.example', 'test-key', {
    auth: { autoRefreshToken: false, persistSession: false }, global: { fetch },
  }));
}

it("opens search and print first, then records while the separate add form is still loading", async () => {
  mocks.role.mockResolvedValue({ role: "admin" });
  let supply!: (value: { name: string }[]) => void;
  mocks.suppliers.mockReturnValue(new Promise(resolve => { supply = resolve; }));
  let release!: () => void;
  let request: URL | undefined;
  database(input => {
    request = new URL(String(input));
    return new Promise(resolve => { release = () => resolve(Response.json([example])); });
  });
  const page = streamPage(await Page({ params: Promise.resolve({ section: "certificates" }), searchParams: Promise.resolve({ q: 'pUmP' }) }));
  try {
    await vi.waitFor(() => expect(page.html()).toContain("Print in Excel"));
    expect(page.html()).toContain("Search records");
    expect(page.html()).toContain("Print template");
    expect(page.html()).not.toContain("Pump Inspection");
    expect(request?.searchParams.get("record_type")).toBe("eq.certificate_license");
    expect(request?.searchParams.get("compliance_cycles.status")).toBe("eq.open");
    expect(request?.searchParams.get("select")).not.toMatch(/!inner|contact_email|required_evidence|template_row/);
    release();
    await vi.waitFor(() => expect(page.html()).toContain("Open Pump Inspection"));
    expect(page.html()).toContain("2:00 PM (MYT)");
    expect(page.html()).toContain("Fixture visit");
    expect(page.html()).not.toContain("Fixture supplier option");
    supply([{ name: "Fixture supplier option" }]);
    await vi.waitFor(() => expect(page.html()).toContain("Fixture supplier option"));
    expect(page.errors).toEqual([]);
  } finally { page.close(); }
});

it.each([["admin", true], ["management_viewer", false]] as const)(
  "preserves supplier attachment selection and source only for an authorized %s", async (role, canSelect) => {
    mocks.role.mockResolvedValue({ role });
    const tables: string[] = [];
    database(async input => {
      const url = new URL(String(input));
      tables.push(url.pathname);
      return Response.json(url.pathname.endsWith('supplier_mail_documents') ? { file_name: 'fixture.pdf' } : [example]);
    });
    const page = streamPage(await Page({ params: Promise.resolve({ section: "servicing" }),
      searchParams: Promise.resolve({ supplierDocumentId: archiveId, sourceMessageId: 'abcdef012345' }) }));
    try {
      await vi.waitFor(() => expect(page.html()).toContain(canSelect ? "Select Pump Inspection" : "Open Pump Inspection"));
      expect(page.html().includes("abcdef012345")).toBe(canSelect);
      expect(tables.some(path => path.endsWith("supplier_mail_documents"))).toBe(canSelect);
      expect(page.html().includes("Print template")).toBe(canSelect);
      expect(mocks.suppliers).not.toHaveBeenCalled();
      expect(page.errors).toEqual([]);
    } finally { page.close(); }
  }
);
