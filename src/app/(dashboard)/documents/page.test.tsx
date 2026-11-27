import type { ReactNode } from "react";
import { PassThrough } from "node:stream";
import { text } from "node:stream/consumers";
import { renderToPipeableStream } from "react-dom/server";
import { prerenderToNodeStream } from "react-dom/static.node";
import { screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DocumentsPage from "./page";

const mocks = vi.hoisted(() => ({
  from: vi.fn(), quotationSelect: vi.fn(), documentRange: vi.fn(),
  listSupplierCompanies: vi.fn(), supplierResult: vi.fn(), requireRole: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/supplier-mail/queries", () => ({ listSupplierCompanies: mocks.listSupplierCompanies }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  prepareDocument: vi.fn(), saveDocument: vi.fn(), documentUrl: vi.fn(), deleteDocument: vi.fn(), updateDocumentCategories: vi.fn(),
}));

const file = { id: "doc-1", file_name: "Plan.pdf", size_bytes: 128, created_at: "2026-11-12", category: null };
const companies = [{ id: "sigma", name: "Sigma" }, { id: "mfe", name: "MFE" }, { id: "lab-testing", name: "Lab Testing" }];

beforeEach(() => {
  mocks.requireRole.mockReset().mockResolvedValue({ role: "admin" });
  mocks.documentRange.mockReset().mockResolvedValue({ data: [file], error: null });
  mocks.listSupplierCompanies.mockReset().mockResolvedValue(companies);
  mocks.supplierResult.mockReset().mockResolvedValue({
    data: companies.map((company, index) => ({ ...company, documents: [{ count: index }] })), error: null,
  });
  mocks.quotationSelect.mockReset().mockReturnValue({
    eq: () => ({ maybeSingle: async () => ({ data: { quotes: [{}, {}] }, error: null }) }),
  });
  mocks.from.mockReset().mockImplementation((table: string) => {
    switch (table) {
      case "system_documents": {
        const query = { order: () => query, range: mocks.documentRange };
        return { select: () => query };
      }
      case "supplier_mail_suppliers":
        return { select: () => ({ order: () => ({ order: mocks.supplierResult }) }) };
      case "quotation_registry":
        return { select: mocks.quotationSelect };
      case "inventory_purchase_orders":
        return { select: async () => ({ count: 5, error: null }) };
      case "billing_document_index":
        return { select: () => ({ eq: async (_column: string, kind: string) => ({ count: kind === "rental" ? 3 : 0, error: null }) }) };
      case "supplier_mail_documents":
        return { select: () => ({ eq: async (_column: string, company: string) => ({ count: 7, error: company === "mfe" ? { message: "Unable to load MFE" } : null }) }) };
      default:
        throw new Error(`Unexpected table ${table}`);
    }
  });
});
afterEach(() => { document.body.replaceChildren(); });

async function renderPage() {
  const { prelude } = await prerenderToNodeStream(await DocumentsPage(), { progressiveChunkSize: Number.MAX_SAFE_INTEGER });
  document.body.innerHTML = await text(prelude);
}

async function streamPage(onChunk: (html: string) => void) {
  const page = await DocumentsPage();
  return new Promise<string>((resolve, reject) => {
    let html = "";
    const output = new PassThrough();
    output.setEncoding("utf8").on("data", chunk => { html += chunk; onChunk(html); });
    output.on("end", () => resolve(html)).on("error", reject);
    const stream = renderToPipeableStream(<html><body>{page}</body></html>, {
      onShellReady: () => stream.pipe(output), onError: reject,
    });
  });
}

it("opens folder links, search and upload while files and folder counts load, then shows files independently", async () => {
  const files = Promise.withResolvers<{ data: typeof file[]; error: null }>();
  const suppliers = Promise.withResolvers<{ data: never[]; error: null }>();
  const quotations = Promise.withResolvers<{ data: { quotes: never[] }; error: null }>();
  mocks.documentRange.mockReturnValueOnce(files.promise);
  mocks.supplierResult.mockReturnValueOnce(suppliers.promise);
  mocks.quotationSelect.mockReturnValueOnce({ eq: () => ({ maybeSingle: () => quotations.promise }) });

  let received = "";
  const rendering = streamPage(html => { received = html; });
  try {
    await vi.waitFor(() => {
      expect(received).toContain('href="/documents/quotations"');
      expect(received).toContain('href="/documents/purchase-orders"');
      expect(received).toContain('id="document-search"');
      expect(received).toContain("Choose documents");
      expect(received).toContain("Clear filters");
    });
    expect(received).not.toContain("No documents uploaded yet.");
    expect(mocks.supplierResult).toHaveBeenCalledOnce();
    expect(mocks.quotationSelect).toHaveBeenCalledWith("quotes:value->quotes");
    files.resolve({ data: [file], error: null });
    await vi.waitFor(() => expect(received).toContain(file.file_name));
  } finally {
    files.resolve({ data: [file], error: null });
    suppliers.resolve({ data: [], error: null });
    quotations.resolve({ data: { quotes: [] }, error: null });
    await rendering;
  }
});

it("keeps all business and supplier folders in order, loading all supplier counts in one lookup", async () => {
  mocks.requireRole.mockResolvedValue({ role: "management_viewer" });
  await renderPage();
  expect(screen.getByText("1 files")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  expect(screen.getAllByRole("link").map(link => [link.querySelector("span")?.textContent, link.querySelector("strong")?.textContent])).toEqual([
    ["Check-out Batch Reports", "—"], ["Utility Reading History", "—"], ["Receipts", "—"], ["Deposit Receipts", "—"],
    ["Payment Vouchers", "—"], ["TM Unifi Payment Receipts", "—"], ["Rental", "3"], ["Utilities", "0"], ["Purchase Orders", "5"],
    ["Quotations", "2"], ["Sigma", "0"], ["MFE", "1"], ["Lab Testing", "2"],
  ]);
  expect(mocks.from).not.toHaveBeenCalledWith("supplier_mail_documents");
  expect(mocks.listSupplierCompanies).not.toHaveBeenCalled();
});

it("shows unavailable counts separately from a confirmed empty folder", async () => {
  mocks.supplierResult.mockResolvedValueOnce({
    data: [{ ...companies[0], documents: [{ count: 0 }] }, companies[1], { ...companies[2], documents: [] }],
    error: null,
  });
  mocks.quotationSelect.mockReturnValueOnce({ eq: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }) });
  await renderPage();
  for (const name of ["MFE", "Lab Testing", "Quotations"]) {
    expect(screen.getByRole("link", { name: new RegExp(name) })).toHaveTextContent("—");
  }
  expect(screen.getByRole("link", { name: /Sigma/ })).toHaveTextContent("0");
});

it("preserves legacy supplier folders and distinguishes failed counts from zero", async () => {
  mocks.supplierResult.mockResolvedValueOnce({ data: null, error: { message: "Unknown relationship" } });
  await renderPage();
  expect(screen.getByRole("link", { name: /MFE/ })).toHaveTextContent("—");
  expect(screen.getByRole("link", { name: /Lab Testing/ })).toHaveTextContent("7");
});

it.each(["cleaner", "maintenance_staff"])("skips management folders and editing controls for %s", async role => {
  mocks.requireRole.mockResolvedValue({ role });
  await renderPage();
  expect(mocks.from.mock.calls).toEqual([["system_documents"]]);
  expect(mocks.listSupplierCompanies).not.toHaveBeenCalled();
  expect(screen.getByText(file.file_name)).toBeInTheDocument();
  expect(screen.getByText("Download")).toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(screen.queryByText("Upload")).toBeNull();
});

it("keeps folder links usable if the document list fails and does not present partial data as a complete list", async () => {
  mocks.documentRange.mockResolvedValueOnce({ data: Array(1000).fill(file), error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "Unable to read archive" } });
  await renderPage();
  expect(mocks.documentRange.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to read archive");
  expect(screen.getByRole("link", { name: /Check-out Batch Reports/ })).toBeInTheDocument();
  expect(screen.queryByText(file.file_name)).toBeNull();
  expect(screen.queryByText("No documents uploaded yet.")).toBeNull();
});

it("continues beyond the first thousand files so historical documents remain available", async () => {
  mocks.requireRole.mockResolvedValue({ role: "cleaner" });
  const first = Array.from({ length: 1000 }, (_, index) => ({ ...file, id: `doc-${index}`, file_name: `File-${index}.pdf` }));
  mocks.documentRange.mockResolvedValueOnce({ data: first, error: null })
    .mockResolvedValueOnce({ data: [{ ...file, id: "oldest", file_name: "Original approval.dwg" }], error: null });
  const page = await DocumentsPage();
  const { prelude } = await prerenderToNodeStream(page);
  const html = await text(prelude);
  expect(html).toContain("Original approval.dwg");
  expect(html).toContain("1001 files");
  expect(mocks.documentRange.mock.calls).toEqual([[0, 999], [1000, 1999]]);
});
