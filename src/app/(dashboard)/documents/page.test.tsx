import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import DocumentsPage from "./page";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  quotationSelect: vi.fn(),
  documentRange: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("@/components/documents-panel", () => ({
  DocumentsPanel: ({ documents, canManage, companyFolders }: {
    documents: unknown[];
    canManage: boolean;
    companyFolders: { name: string; href: string; count: number | null }[];
  }) => <>
    <p>{documents.length} files</p>
    {canManage && <p>Management</p>}
    {companyFolders.map(folder => <a key={folder.href} href={folder.href}>{folder.name} · {folder.count ?? "—"}</a>)}
  </>,
}));

const file = { id: "doc-1", file_name: "Plan.pdf", size_bytes: 128, created_at: "2026-11-12", category: null };

beforeEach(() => {
  mocks.requireRole.mockReset();
  mocks.documentRange.mockReset().mockResolvedValue({ data: [file], error: null });
  mocks.quotationSelect.mockReset().mockReturnValue({
    eq: () => ({ maybeSingle: async () => ({ data: { quotes: [{}, {}] }, error: null }) }),
  });
  mocks.from.mockReset().mockImplementation((table: string) => {
    switch (table) {
      case "system_documents": {
        const query = { order: () => query, range: mocks.documentRange };
        return { select: () => query };
      }
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

it("starts business and supplier folder reads while the document list is pending", async () => {
  mocks.requireRole.mockResolvedValue({ role: "admin" });
  let finishDocuments!: () => void;
  mocks.documentRange.mockImplementationOnce(() => new Promise(resolve => {
    finishDocuments = () => resolve({ data: [file], error: null });
  }));

  const page = DocumentsPage();
  try {
    await vi.waitFor(() => expect(mocks.from.mock.calls.map(([table]) => table).sort()).toEqual([
      "billing_document_index", "billing_document_index", "inventory_purchase_orders", "quotation_registry",
      "supplier_mail_documents", "supplier_mail_documents", "system_documents",
    ]));
  } finally {
    finishDocuments?.();
  }
  render(await page);

  expect(mocks.quotationSelect).toHaveBeenCalledWith("quotes:value->quotes");
  expect(screen.getByText("1 files")).toBeInTheDocument();
  expect(screen.getAllByRole("link").map(link => link.textContent)).toEqual([
    "Utility Reading History · —", "Receipts · —", "Rental · 3", "Utilities · 0",
    "Purchase Orders · 5", "Quotations · 2", "Sigma · 7", "MFE · —",
  ]);
});

it("skips all management folder queries for a cleaner", async () => {
  mocks.requireRole.mockResolvedValue({ role: "cleaner" });
  render(await DocumentsPage());

  expect(mocks.from.mock.calls).toEqual([["system_documents"]]);
  expect(screen.getByText("1 files")).toBeInTheDocument();
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(screen.queryByText("Management")).toBeNull();
});
