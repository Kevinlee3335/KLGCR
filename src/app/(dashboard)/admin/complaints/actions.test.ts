import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirect, from, rpc } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn().mockResolvedValue({ id: "admin-id", role: "admin" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({ from, rpc }),
}));

import { assignComplaint } from "./actions";

function complaintLookup(roomAccess: string | null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { room_access_permission: roomAccess },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("assignComplaint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({ error: null });
  });

  it("approves normalized YES access with assigned staff only and creates no appointment", async () => {
    from.mockImplementation((table: string) => {
      if (table === "complaints") return complaintLookup("  YES ");
      throw new Error(`Unexpected table access: ${table}`);
    });
    const data = new FormData();
    data.set("staffId", "00000000-0000-4000-8000-000000000001");

    await expect(assignComplaint("complaint-id", data)).rejects.toThrow("REDIRECT:/admin/jobs?assigned=1");

    expect(rpc).toHaveBeenCalledWith("assign_complaint", {
      p_complaint_id: "complaint-id",
      p_assigned_to: "00000000-0000-4000-8000-000000000001",
    });
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalledWith("appointments");
  });

  it("rejects normalized NO access when maintenance date and time are missing", async () => {
    from.mockReturnValue(complaintLookup(" No "));
    const data = new FormData();
    data.set("staffId", "00000000-0000-4000-8000-000000000001");

    await expect(assignComplaint("complaint-id", data)).rejects.toThrow(
      "REDIRECT:/admin/complaints/complaint-id?error=Select%20a%20Maintenance%20Date%20and%20Maintenance%20Time%20before%20approving%20the%20job.",
    );

    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalledWith("appointments");
  });
});
