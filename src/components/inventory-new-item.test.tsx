import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { InventoryNewItem } from "./inventory-new-item";

beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=vi.fn(function(this:HTMLDialogElement){this.setAttribute("open","");});
 HTMLDialogElement.prototype.close=vi.fn(function(this:HTMLDialogElement){this.removeAttribute("open");});
});

it("starts with the name, shows automatic Piping codes and the existing item warning",()=>{
 render(<InventoryNewItem store="building" items={[{item_code:"KLGCR-PG00097",description:"PVC JOINT  : 20 MM (GREY PIPE)",category:"Piping"}]}/>);
 fireEvent.click(screen.getByRole("button",{name:"New Item"}));
 const dialog=screen.getByRole("dialog");
 fireEvent.change(within(dialog).getByLabelText("Item Name / Description"),{target:{value:"PVC JOINT : 20 MM (GREY PIPE)"}});
 expect(within(dialog).getByLabelText("Category")).toHaveValue("Piping");
 expect(within(dialog).getByText("KLGCR-PG00098")).toBeInTheDocument();
 expect(within(dialog).getByText("Similar items already exist")).toBeInTheDocument();
 expect(dialog.querySelector('input[name="itemCode"]')).toBeNull();
});

it("requires manual classification for unknown items and preserves that choice while the name changes",()=>{
 render(<InventoryNewItem store="building" items={[]}/>);
 fireEvent.click(screen.getByRole("button",{name:"New Item"}));
 fireEvent.change(screen.getByLabelText("Item Name / Description"),{target:{value:"Special part"}});
 expect(screen.getByRole("button",{name:"Create Item"})).toBeDisabled();
 fireEvent.change(screen.getByLabelText("Category"),{target:{value:"Building"}});
 fireEvent.change(screen.getByLabelText("Item Name / Description"),{target:{value:"PVC special part"}});
 expect(screen.getByLabelText("Category")).toHaveValue("Building");
 expect(screen.getByRole("button",{name:"Create Item"})).toBeEnabled();
 fireEvent.click(screen.getByRole("button",{name:"Use auto"}));
 expect(screen.getByLabelText("Category")).toHaveValue("Piping");
});
