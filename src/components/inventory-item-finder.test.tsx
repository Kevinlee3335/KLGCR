import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { InventoryItemFinder } from "./inventory-item-finder";

it("suggests existing items by code or name and links to the matching stock list", () => {
  render(<InventoryItemFinder store="building" items={[
    { item_code: "KLGCR-B00033", description: "DOOR HANDLE", category: "Building" },
    { item_code: "KLGCR-E00002", description: "WINDOW LIGHT", category: "Electrical" },
  ]}/>);
  const input = screen.getByRole("searchbox", { name: "Find existing item by code or name" });

  fireEvent.change(input, { target: { value: "B00033" } });
  expect(screen.getByRole("link", { name: /KLGCR-B00033 DOOR HANDLE/ })).toHaveAttribute("href", "/admin/inventory?store=building&q=KLGCR-B00033#inventory-stock-list");
  expect(screen.queryByText("WINDOW LIGHT")).not.toBeInTheDocument();

  fireEvent.change(input, { target: { value: "window" } });
  expect(screen.getByRole("link", { name: /KLGCR-E00002 WINDOW LIGHT/ })).toHaveAttribute("href", "/admin/inventory?store=building&q=KLGCR-E00002#inventory-stock-list");
});

it.each([
  ["cleaner", "CLN-0001", "BLEACH", "Cleaner Supplies"],
  ["office", "OFF-0001", "PAPER", "Office Inventory"],
] as const)("keeps the %s store when opening a search result", (store, code, description, category) => {
  render(<InventoryItemFinder store={store} items={[{ item_code: code, description, category }]}/>);

  fireEvent.change(screen.getByRole("searchbox"), { target: { value: description } });

  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    `/admin/inventory?store=${store}&q=${code}#inventory-stock-list`,
  );
});
