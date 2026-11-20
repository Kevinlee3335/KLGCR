import { expect, it } from "vitest";
import { inventoryCodePreview, matchingInventoryItems, suggestInventoryCategory } from "./inventory-new-item";

it("classifies the requested PVC joint and leaves unknown or ambiguous names for manual selection", () => {
  expect(suggestInventoryCategory("PVC JOINT : 20 MM (GREY PIPE)", "building", [])).toBe("Piping");
  expect(suggestInventoryCategory("SPECIAL PART 88", "building", [])).toBe("");
  expect(suggestInventoryCategory("PVC SOCKET JOINT", "building", [])).toBe("");
  expect(suggestInventoryCategory("LED TUBE", "building", [])).toBe("Electrical");
  expect(suggestInventoryCategory("Jotun white paint", "building", [])).toBe("Painting");
  expect(suggestInventoryCategory("anything", "office", [])).toBe("Office Inventory");
});

it("continues numeric series across short legacy codes without mixing Painting and Piping", () => {
  const items = ["KLGCR-PG00097", "KLGCR-PG0044", "KLGCR-PG00150", "KLGCR-P00064", "B00209", "KLGCR-B00208"].map(item_code => ({ item_code }));
  expect(inventoryCodePreview("Piping", items)).toEqual({ latest: "KLGCR-PG00150", next: "KLGCR-PG00151" });
  expect(inventoryCodePreview("Painting", items)?.next).toBe("KLGCR-P00065");
  expect(inventoryCodePreview("Building", items)).toEqual({ latest: "B00209", next: "KLGCR-B00210" });
  expect(inventoryCodePreview("Office Inventory", [])?.next).toBe("OFF-0001");
  expect(inventoryCodePreview("Piping", [{item_code:"KLGCR-PG99999"}])?.next).toBe("KLGCR-PG100000");
});

it("finds the existing joint despite whitespace and punctuation differences", () => {
  const joint = {item_code:"KLGCR-PG00097",description:"PVC JOINT  : 20 MM (GREY PIPE)",category:"Piping"};
  expect(matchingInventoryItems("PVC JOINT : 20 MM (GREY PIPE)", [joint])).toEqual([joint]);
  expect(suggestInventoryCategory(joint.description,"building",[joint])).toBe("Piping");
});
