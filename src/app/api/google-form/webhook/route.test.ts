import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Record<string, unknown>[] = [];
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => table === "blocks" ? {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 7 }, error: null }) }) }),
    } : {
      insert: (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return { select: () => ({ single: async () => ({ data: { id: "complaint-1" }, error: null }) }) };
      },
    },
  }),
}));

import { POST } from "./route";

describe("Google Form webhook", () => {
  beforeEach(() => {
    inserted.length = 0;
    process.env.GOOGLE_FORM_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it.each([
    ["YES", false],
    ["NO", true],
  ])("persists a real response-sheet row with access %s", async (access, appointmentRequired) => {
    const response = await POST(new Request("http://localhost/api/google-form/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-klgcr-form-secret": "test-secret" },
      body: JSON.stringify({
        source_reference: `response-${access}`,
        namedValues: {
          Timestamp: ["9/9/2026 14:30:00"], BLOCK: ["A"],
          "ROOM NUMBER / COMMON AREA": ["A101"], "MAINTENANCE TYPE": ["Plumbing"],
          "REPORT DESCRIPTION": ["Water leak"], "ROOM AVAILABILITY (DATE)": ["9/18/2026"],
          "ROOM AVAILABILITY (TIME)": ["2:30:00 PM"],
          "REQUEST FOR ROOM ACCESS DUE TO TENANT'S UNAVAILABILITY": [access],
        },
      }),
    }) as never);
    expect(response.status).toBe(200);
    expect(inserted[0]).toMatchObject({
      preferred_date: "2026-09-18", preferred_time: "14:30:00",
      room_access_permission: access.toLowerCase(), appointment_required: appointmentRequired,
    });
  });
});
