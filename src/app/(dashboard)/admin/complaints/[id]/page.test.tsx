import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/complaint-form", () => ({
  ComplaintForm: () => <div>Complaint form</div>,
  AssignmentForm: () => <div>Assignment form</div>,
}));
vi.mock("@/components/reject-complaint-form", () => ({ RejectComplaintForm: () => null }));
vi.mock("@/components/phase2-ui", () => ({
  StatusBadge: () => null,
  PriorityBadge: () => null,
}));
vi.mock("../actions", () => ({
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
}));

const complaint = {
  id: "complaint-id",
  complaint_no: "CMP-2026-0001",
  source: "manual",
  source_reference: null,
  photo_url: null,
  room_no: "101",
  complainant_name: "Student",
  complainant_contact: "0123456789",
  category: "Plumbing",
  description: "Leaking tap",
  priority: "normal",
  status: "new",
  submitted_at: "2026-09-09T00:00:00Z",
  assigned_at: null,
  block: { id: 1, code: "A" },
  assignee: null,
};

function query(result: unknown) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.maybeSingle.mockReturnValue(builder);
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table === "blocks") return query({ data: [{ id: 1, code: "A" }] });
      if (table === "profiles") return query({ data: [] });
      if (table === "appointments") return query({ data: [], error: null });
      return query({ data: complaint, error: null });
    }),
  }),
}));

import ComplaintDetail from "./page";
import { createClient } from "@/lib/supabase/server";

describe("Complaint Review", () => {
  it("renders the complaint when the optional availability lookup fails", async () => {
    const client = await createClient();
    vi.mocked(client.from).mockImplementation((table: string) => {
      if (table === "blocks") return query({ data: [{ id: 1, code: "A" }] }) as never;
      if (table === "profiles") return query({ data: [] }) as never;
      if (table === "appointments") return query({ data: [], error: null }) as never;

      const complaintQuery = query({ data: complaint, error: null });
      complaintQuery.select.mockImplementation((columns: string) =>
        columns.startsWith("preferred_date")
          ? query({ data: null, error: { message: "optional column is unavailable" } })
          : complaintQuery,
      );
      return complaintQuery as never;
    });

    const page = await ComplaintDetail({
      params: Promise.resolve({ id: complaint.id }),
      searchParams: Promise.resolve({}),
    });

    expect(renderToStaticMarkup(page)).toContain("CMP-2026-0001");
    expect(renderToStaticMarkup(page)).toContain("Complaint form");
  });
});
