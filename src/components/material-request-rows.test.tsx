import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { MaterialItem } from "@/lib/staff-material-catalog";
import { MaterialRequestRows } from "./material-request-rows";

const item = { id: "tap-id", item_code: "B-0123", description: "Water tap", balance_qty: 4, unit: "pcs" };

afterEach(() => vi.unstubAllGlobals());

it("accepts a code typed before the streamed catalog arrives without another request", async () => {
  let complete!: (items: MaterialItem[]) => void;
  const catalog = new Promise<MaterialItem[]>(resolve => { complete = resolve; });
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<MaterialRequestRows catalog={catalog}/>);
  const [first, second] = screen.getAllByRole("combobox") as HTMLInputElement[];

  expect(fetch).not.toHaveBeenCalled();
  fireEvent.focus(first);
  fireEvent.change(first, { target: { value: item.item_code } });
  fireEvent.focus(second);
  fireEvent.change(second, { target: { value: "tap" } });
  expect(fetch).not.toHaveBeenCalled();
  expect(first.checkValidity()).toBe(false);
  expect(screen.queryByText("No active inventory item matches this search.")).toBeNull();

  complete([item]);
  fireEvent.click(await screen.findByRole("option", { name: /Water tap/ }));
  expect(Array.from(container.querySelectorAll<HTMLInputElement>("input[name=itemId]")).map(input => input.value))
    .toEqual([item.id, item.id, ""]);
  expect(first.checkValidity()).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Add Material/ }));
  fireEvent.focus(screen.getAllByRole("combobox")[3]);
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps Other Item independent of inventory and retries a failed lookup", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ items: [item] }));
  vi.stubGlobal("fetch", fetch);
  render(<form><MaterialRequestRows catalog={Promise.resolve(null)}/></form>);
  fireEvent.click(screen.getAllByRole("button", { name: "Other Item" })[0]);
  fireEvent.change(screen.getByLabelText("Other material name", { selector: 'input[type="text"]' }), { target: { value: "Special connector" } });
  const form = document.querySelector("form")!;
  expect(new FormData(form).get("itemId")).toBe("other");
  expect(fetch).not.toHaveBeenCalled();

  const second = screen.getAllByRole("combobox")[0];
  fireEvent.change(second, { target: { value: "tap" } });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load inventory");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.getByRole("option")).toHaveTextContent("Water tap"));
  expect(fetch).toHaveBeenCalledTimes(1);
});
