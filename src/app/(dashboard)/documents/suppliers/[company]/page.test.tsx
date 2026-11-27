// @vitest-environment node
import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import CompanyArchive from "./page";
import SupplierEmail from "./emails/[id]/page";

const mocks = vi.hoisted(() => ({ db: vi.fn(), role: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.db }));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.role }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("Not found"); }, useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const company = "sigma";
const id = "1234567890abcdef";
const archiveDocument = { id: "doc-1", file_name: "Service report.pdf", folder: "Service Report", size_bytes: 5000,
  supplier_mail_attachments: [{ message_id: id, supplier_emails: { subject: "Annual inspection", received_at: "2026-10-12T02:00:00Z" } }] };
const email = { id, company, subject: "Annual inspection", sender: "supplier@example.com", received_at: "2026-10-12T02:00:00Z",
  body_text: "Please check the enclosed inspection report." };
const requests: URL[] = [];
const gates = new Map<string, Promise<void>>();
function pause(table: string) {
  const gate = Promise.withResolvers<void>();
  gates.set(table, gate.promise);
  return gate.resolve;
}
function reads(table: string) { return requests.filter(url => url.pathname.endsWith("/" + table)); }

beforeEach(() => {
  gates.clear(); requests.length = 0;
  mocks.role.mockReset().mockResolvedValue({ role: "admin" });
  mocks.db.mockReset().mockResolvedValue(createClient("https://archive.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      requests.push(url);
      await gates.get(table);
      switch (table) {
        case "supplier_mail_suppliers":
          return Response.json([{ id: url.searchParams.get("id")?.slice(3), name: "Test supplier" }]);
        case "supplier_emails":
          return Response.json(url.searchParams.get("company") === "eq.sigma" ? [email] : []);
        case "supplier_mail_documents":
          return Response.json([archiveDocument], { headers: { "Content-Range": "50-50/105" } });
        case "supplier_mail_attachments":
          return Response.json([{ file_name: archiveDocument.file_name, document_id: archiveDocument.id, issue: null }]);
        case "compliance_cycle_documents":
          return Response.json([{ id: "existing-link", supplier_document_id: archiveDocument.id,
            cycle: { id: "cycle-1", due_date: null, record: { id: "record-1", title: "Lift verification" } } }]);
        default: throw new Error("Unexpected table " + table);
      }
    } },
  }));
});

async function stream(content: Promise<React.ReactNode>, onChunk: (html: string) => void) {
  const page = await content;
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const output = new PassThrough();
    output.setEncoding("utf8").on("data", chunk => { html += chunk; onChunk(html); });
    output.on("end", () => resolve(html)).on("error", reject);
    const result = renderToPipeableStream(<html><body>{page}</body></html>, {
      onShellReady: () => result.pipe(output), onError: reject,
    });
  });
}

it("shows email content first and lets readers open a PDF before its cert links finish loading", async () => {
  const releaseFiles = pause("supplier_mail_attachments");
  const releaseLinks = pause("compliance_cycle_documents");
  let emitted = "";
  const done = stream(SupplierEmail({ params: Promise.resolve({ company, id }) }), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain(email.body_text));
    expect(emitted).toContain("Open original in Gmail");
    expect(emitted).not.toContain("No archived PDF attachments");
    releaseFiles();
    await vi.waitFor(() => expect(emitted).toContain("Open PDF"));
    expect(emitted).toContain(archiveDocument.file_name);
    expect(emitted).not.toContain("Lift verification");
  } finally { releaseFiles(); releaseLinks(); }
  expect(await done).toContain("Lift verification");
  expect(reads("supplier_mail_attachments")[0].searchParams.get("message_id")).toBe("eq." + id);
  expect(mocks.role).toHaveBeenCalledWith(["admin", "management_viewer"]);
});

it("rejects a valid message id owned by another company before reading its attachments", async () => {
  await expect(SupplierEmail({ params: Promise.resolve({ company: "mfe", id }) })).rejects.toThrow("Not found");
  expect(reads("supplier_emails")[0].searchParams.get("company")).toBe("eq.mfe");
  expect(reads("supplier_emails")[0].searchParams.get("id")).toBe("eq." + id);
  expect(reads("supplier_mail_attachments")).toHaveLength(0);
  expect(reads("compliance_cycle_documents")).toHaveLength(0);
});

it("keeps the historical folder, pagination and email URLs available independently of cert links", async () => {
  mocks.role.mockResolvedValue({ role: "management_viewer" });
  const releaseFiles = pause("supplier_mail_documents");
  const releaseLinks = pause("compliance_cycle_documents");
  let emitted = "";
  const done = stream(CompanyArchive({ params: Promise.resolve({ company }), searchParams: Promise.resolve({ folder: "Service Report", page: "2" }) }), html => { emitted = html; });
  try {
    await vi.waitFor(() => expect(emitted).toContain("Search item, description or number"));
    expect(emitted).not.toContain("No documents found");
    releaseFiles();
    await vi.waitFor(() => expect(emitted).toContain(archiveDocument.file_name));
    expect(emitted).toContain('/documents/suppliers/sigma/emails/' + id);
    expect(emitted).toContain('folder=Service+Report&amp;page=3');
    expect(emitted).not.toContain("Link to Cert");
    expect(emitted).not.toContain("Lift verification");
  } finally { releaseFiles(); releaseLinks(); }
  expect(await done).toContain("Lift verification");
  const request = reads("supplier_mail_documents")[0];
  expect(request.searchParams.get("company")).toBe("eq.sigma");
  expect(request.searchParams.get("folder")).toBe("eq.Service Report");
  expect(request.searchParams.get("offset")).toBe("50");
  expect(reads("compliance_cycle_documents")).toHaveLength(1);
});

it("stops before any data query if the management role check fails", async () => {
  mocks.role.mockRejectedValue(new Error("Access denied"));
  await expect(SupplierEmail({ params: Promise.resolve({ company, id }) })).rejects.toThrow("Access denied");
  await expect(CompanyArchive({ params: Promise.resolve({ company }), searchParams: Promise.resolve({}) })).rejects.toThrow("Access denied");
  expect(mocks.db).not.toHaveBeenCalled();
});
