import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MatchMaterialItem } from "./match-material-item";

const line = { requestId: "request-1", itemId: "line-1", materialName: "Window handle" };
const handle = { id: "inventory-1", item_code: "KLG-B001", description: "Window Handle (L)", inventory_group: "building", balance_qty: 0, unit: "pcs", quantity_unverified: false };
const lock = { ...handle, id: "inventory-2", item_code: "OFF-0002", description: "Lock", inventory_group: "office", quantity_unverified: true };
const response = (items: unknown[]) => new Response(JSON.stringify({ items }));

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: /Match Item/ }));
  return screen.getByRole("searchbox", { name: "Inventory item code or name" });
}

afterEach(() => vi.unstubAllGlobals());

it("loads results only when searching, then posts the original match fields", async () => {
  const fetcher = vi.fn().mockResolvedValue(response([handle, lock]));
  vi.stubGlobal("fetch", fetcher);
  render(<MatchMaterialItem {...line}/>);
  expect(fetcher).not.toHaveBeenCalled();

  const search = openSearch();
  expect(search).toHaveFocus();
  fireEvent.change(search, { target: { value: "w" } });
  expect(screen.getByText("Enter at least 2 characters.")).toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm Match" })).toBeDisabled();

  fireEvent.change(search, { target: { value: " Window Handle (L) " } });
  const option = await screen.findByRole("radio", { name: /Window Handle/ });
  const [url, options] = fetcher.mock.calls[0];
  expect(new URL(url, "https://example.test").searchParams.get("q")).toBe("Window Handle (L)");
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(screen.getByText("Building Material · Balance 0 pcs")).toBeInTheDocument();
  expect(screen.getByText("Office Inventory · Quantity pending confirmation")).toBeInTheDocument();
  fireEvent.click(option);
  expect(screen.getByRole("button", { name: "Confirm Match" })).toBeEnabled();
  const form = screen.getByRole<HTMLFormElement>("form", { name: "Match Window handle to inventory" });
  expect(form).toHaveAttribute("action", "/admin/material-requests/action");
  expect(form).toHaveAttribute("method", "post");
  expect(Object.fromEntries(new FormData(form))).toEqual({
    action: "match_other", requestId: "request-1", requestItemId: "line-1", inventoryItemId: "inventory-1",
  });

  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.getByRole("button", { name: /Match Item/ })).toHaveFocus();
});

it("offers retry after a search error and keeps confirmation disabled when nothing matches", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValueOnce(response([]));
  vi.stubGlobal("fetch", fetcher);
  render(<MatchMaterialItem {...line}/>);
  fireEvent.change(openSearch(), { target: { value: "missing" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to search inventory.");
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  expect(await screen.findByText("No active inventory item matches this search.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirm Match" })).toBeDisabled();
});

it("aborts the previous search and prevents an old selection from being submitted", async () => {
  let completeStale!: (value: Response) => void;
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response([handle]))
    .mockImplementationOnce(() => new Promise<Response>((resolve) => { completeStale = resolve; }))
    .mockResolvedValueOnce(response([lock]));
  vi.stubGlobal("fetch", fetcher);
  render(<MatchMaterialItem {...line}/>);
  const search = openSearch();
  fireEvent.change(search, { target: { value: "handle" } });
  fireEvent.click(await screen.findByRole("radio", { name: /Window Handle/ }));
  fireEvent.change(search, { target: { value: "window" } });
  expect(screen.getByRole("button", { name: "Confirm Match" })).toBeDisabled();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

  fireEvent.change(search, { target: { value: "lock" } });
  expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  expect(await screen.findByRole("radio", { name: /OFF-0002/ })).not.toBeChecked();
  await act(async () => completeStale(response([handle])));
  expect(screen.queryByRole("radio", { name: /Window Handle/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Confirm Match" })).toBeDisabled();
});
