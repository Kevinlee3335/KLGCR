import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DailyTaskDetails } from "./daily-task-details";

const activity = [{
  id: 3, action: "Completed", comment: "Meter checked",
  created_at: "2026-11-12T03:00:00Z", actor: { full_name: "Siti" },
}];
const photos = [{ id: "photo-1", created_at: activity[0].created_at, url: "https://example.test/signed/photo" }];

function toggle(label: string, open: boolean) {
  const details = screen.getByText(label).closest("details")!;
  details.open = open;
  fireEvent(details, new Event("toggle"));
}

afterEach(() => vi.unstubAllGlobals());

it("queries only the selected disclosure when it opens", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ view: "timeline", activity }))
    .mockResolvedValueOnce(Response.json({ view: "photos", photos }));
  vi.stubGlobal("fetch", fetcher);
  render(<DailyTaskDetails taskId={32} hasPhotos/>);
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.queryByText("Meter checked")).toBeNull();
  expect(screen.queryByRole("img")).toBeNull();

  toggle("Timeline", true);
  expect(await screen.findByText("Meter checked")).toBeInTheDocument();
  expect(screen.getByText("Siti")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/daily-tasks/32/details?view=timeline", expect.objectContaining({ cache: "no-store" }));
  expect(screen.queryByRole("img")).toBeNull();

  toggle("Completion photos", true);
  expect(await screen.findByRole("img", { name: "Daily task completion evidence" })).toHaveAttribute("src", photos[0].url);
  expect(fetcher).toHaveBeenLastCalledWith("/api/daily-tasks/32/details?view=photos", expect.anything());
});

it("aborts a pending request when the disclosure closes", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  render(<DailyTaskDetails taskId={32} hasPhotos={false}/>);
  expect(screen.queryByText("Completion photos")).toBeNull();
  toggle("Timeline", true);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0][1].signal;
  expect(signal.aborted).toBe(false);
  toggle("Timeline", false);
  expect(signal.aborted).toBe(true);
  await act(async () => finish(Response.json({ view: "timeline", activity })));
  expect(screen.queryByText("Meter checked")).toBeNull();
});

it("can retry a failed request and still show an empty timeline", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ view: "timeline", activity: [] }));
  vi.stubGlobal("fetch", fetcher);
  render(<DailyTaskDetails taskId={32} hasPhotos={false}/>);
  toggle("Timeline", true);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load timeline.");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No progress update yet.")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
