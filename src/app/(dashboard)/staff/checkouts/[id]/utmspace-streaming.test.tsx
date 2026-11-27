import { PassThrough } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import RoomPage from "./page";

const { db } = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: db }));
vi.mock("@/lib/auth", () => ({ requireRole: () => ({ id: "tech", role: "maintenance_staff" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("../actions", () => ({ completeRectification: vi.fn(), completeCleaning: vi.fn(), reportCleaningDefects: vi.fn() }));

it("keeps imported titles, original report and repair selections usable while signed UTMSPACE photos and history load", async () => {
  const history = Promise.withResolvers<void>();
  const signing = Promise.withResolvers<void>();
  const title = "Bathroom light flickers";
  const source = { sourceId: "A103-07", title, originalItem: "Lampu", originalFinding: "Lampu berkelip",
    originalAction: "Periksa lampu", sourceStatus: "Open", inspectionId: "INS-2026", reportedDate: "2026-11-20",
    filename: "A103-report.pdf", pageNumber: 7 };
  const signedUrl = "https://storage.example/signed/inspection.jpg";
  const photoPath = "room/inspection.jpg";
  const requests = new Map<string, URL>();
  const client = createSupabaseClient("https://checkout.example", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async input => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").pop()!;
      requests.set(table, url);
      switch (table) {
        case "checkout_rooms": return Response.json({ id: "room", reference_no: "CO-A103", room_no: "103",
          status: "rectification", assigned_to: "tech", block: { code: "A" } });
        case "checkout_defects": return Response.json([
          { id: "imported", description: "Defect detail text", status: "open", source: "utmspace", utmspace_pdf_source: source },
          { id: "manual", description: "Tap leak", status: "open", source: "second_inspection", utmspace_pdf_source: null },
          { id: "done", description: "Handled", status: "rectified", source: "utmspace", utmspace_pdf_source: null },
        ]);
        case "checkout_photos": return Response.json([{ id: "picture", kind: "inspection", storage_path: photoPath,
          utmspace_pdf_source: { sourceId: source.sourceId, title, label: "recheck", sourcePage: 8 } }]);
        case "checkout_history":
          await history.promise;
          return Response.json([]);
        default: throw Error("Unexpected table " + table);
      }
    } },
  });
  const sign = vi.fn(async () => {
    await signing.promise;
    return { data: [{ path: photoPath, signedUrl }], error: null };
  });
  const bucket = vi.fn(() => ({ createSignedUrls: sign }));
  db.mockResolvedValue({ from: client.from.bind(client), storage: { from: bucket } });

  let html = "";
  const done = (async () => {
    const page = await RoomPage({ params: Promise.resolve({ id: "room" }), searchParams: Promise.resolve({}) });
    return new Promise<void>((resolve, reject) => {
      const output = new PassThrough();
      output.setEncoding("utf8").on("data", chunk => { html += chunk; });
      output.on("end", resolve).on("error", reject);
      const stream = renderToPipeableStream(<html><body>{page}</body></html>, {
        onShellReady: () => stream.pipe(output), onError: reject,
      });
    });
  })();
  try {
    await vi.waitFor(() => { expect(html).toContain("Loading photo evidence"); expect(sign).toHaveBeenCalledOnce(); });
    const body = new DOMParser().parseFromString(html, "text/html").body;
    for (const value of [source.sourceId, source.originalItem, source.originalFinding, source.originalAction, source.filename, source.inspectionId]) {
      expect(body.querySelector(".defect-list details")?.textContent).toContain(value);
    }
    expect(body.querySelector(".defect-list strong")?.textContent).toBe(title);
    expect(body.querySelector(".checkout-repair-item summary")?.textContent).toBe(title);
    const batch = body.querySelector(".checkout-batch-update form") as HTMLFormElement;
    const checkboxes = [...batch.querySelectorAll<HTMLInputElement>('input[name="rectifiedDefects"]')];
    expect(checkboxes.map(input => [input.value, input.parentElement?.textContent])).toEqual([["imported", title], ["manual", "Tap leak"]]);
    checkboxes[0].click();
    expect(new FormData(batch).getAll("rectifiedDefects")).toEqual(["imported"]);
    expect(html).not.toContain(signedUrl);
    signing.resolve();
    const caption = title + " · Recheck (UTMSPACE report) · PDF page 8";
    await vi.waitFor(() => expect(html).toContain(caption));
    const image = new DOMParser().parseFromString(html, "text/html").querySelector(".photo-grid img");
    expect(image?.getAttribute("src")).toBe(signedUrl);
    expect(image?.getAttribute("alt")).toBe(caption);
    expect(image?.nextElementSibling?.textContent).toBe(caption);
    expect(image?.closest("a")?.getAttribute("href")).toBe(signedUrl);
  } finally {
    signing.resolve(); history.resolve(); await done;
  }
  for (const table of ["checkout_defects", "checkout_photos"]) {
    expect(requests.get(table)?.searchParams.get("select")).toContain("utmspace_pdf_source");
    expect(requests.get(table)?.searchParams.get("checkout_room_id")).toBe("eq.room");
  }
  expect(bucket).toHaveBeenCalledWith("checkout-evidence");
  expect(sign).toHaveBeenCalledWith([photoPath], 3600);
});
