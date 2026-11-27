import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { InventorySearchInput } from "./inventory-search-input";
import type { InventoryCodeItem } from "@/lib/inventory-new-item";

it("preserves the submitted and newly typed search while warehouse suggestions arrive", async () => {
  const catalog = Promise.withResolvers<InventoryCodeItem[]>();
  const view = render(<InventorySearchInput search="Pa" suggestions={catalog.promise} />);
  const input = screen.getByRole("combobox");
  expect(input).toHaveValue("Pa");
  expect(view.container.querySelector("option")).toBeNull();

  await act(async () => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Paper" } });
  });
  expect(input).toHaveValue("Paper");
  expect(view.container.querySelector("option")).toBeNull();

  await act(async () => {
    catalog.resolve([{ item_code: "OFF-0001", description: "Paper", category: "Office Inventory" }]);
  });
  const suggestions = document.getElementById(input.getAttribute("list")!);
  expect(suggestions?.querySelector("option")).toHaveAttribute("label", "OFF-0001 · Office Inventory");
  expect(suggestions?.querySelector("option")).toHaveValue("Paper");
  expect(screen.getByRole("combobox")).toBe(input);
  expect(input).toHaveValue("Paper");
});
