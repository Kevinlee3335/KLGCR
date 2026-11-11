import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentDeliveryStatus } from "./document-delivery-status";

const id = "11111111-1111-4111-8111-111111111111";
const response = (status: string, sentAt: string | null = null) => new Response(JSON.stringify({ status, sentAt }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("updates an approved Gym report when Accounts delivery is confirmed, then stops polling", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response("pending"))
    .mockResolvedValueOnce(response("sent", "2026-11-11T04:30:00.000Z"));
  vi.stubGlobal("fetch", fetcher);

  render(<DocumentDeliveryStatus type="gym" id={id} />);
  await act(async () => {});
  expect(screen.getByRole("status")).toHaveTextContent("Email to Accounts Awaiting delivery");
  expect(fetcher).toHaveBeenCalledWith(`/api/document-review/gym/${id}/delivery`, expect.objectContaining({ cache: "no-store" }));

  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(screen.getByRole("status")).toHaveTextContent("Email to Accounts Sent");
  expect(screen.getByRole("status")).toHaveTextContent("12:30 MYT");
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("shows billing failure details as a state and offers a read-only refresh or the existing invoice history", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response("uncertain"))
    .mockResolvedValueOnce(response("blocked"));
  vi.stubGlobal("fetch", fetcher);

  render(<DocumentDeliveryStatus type="billing" id={id} />);
  expect(await screen.findByText("Delivery needs checking")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open invoice history" })).toHaveAttribute("href", `/admin/billing#invoice-${id}`);

  fireEvent.click(screen.getByRole("button", { name: "Check status" }));
  expect(await screen.findByText("Delivery blocked")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([, options]) => options.method === undefined)).toBe(true);
});

it("recovers from a status lookup error without claiming that email delivery failed", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(null, { status: 503 }))
    .mockResolvedValueOnce(response("sent", "2026-11-11T04:30:00.000Z")));

  render(<DocumentDeliveryStatus type="gym" id={id} />);
  expect(await screen.findByText("Unable to refresh email status.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check status" }));
  expect(await screen.findByText("Sent")).toBeInTheDocument();
});
