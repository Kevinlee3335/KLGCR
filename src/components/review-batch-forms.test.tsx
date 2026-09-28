import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MaterialItemPicker } from "./material-item-picker";
import { CalendarEventForm } from "./calendar-event-form";
import { ComplaintForm } from "./complaint-form";
import { JobActivityTimeline } from "./job-activity-timeline";
vi.mock("@/app/(dashboard)/admin/complaints/actions",()=>({createComplaint:vi.fn(),reviewComplaint:vi.fn(),assignComplaint:vi.fn()}));
describe("review batch forms",()=>{
  it("submits a typed Other item without a fake inventory ID",()=>{
    render(<form><MaterialItemPicker items={[]} name="itemId" required/></form>);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Other material name"),{target:{value:"Custom connector"}});
    const data=new FormData(document.querySelector("form")!);
    expect(data.get("itemId")).toBe("other");expect(data.get("otherItemName")).toBe("Custom connector");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("submits only the selected calendar recipients",()=>{
    render(<CalendarEventForm staff={[{id:"one",full_name:"Abdullah"},{id:"two",full_name:"Faiz"},{id:"three",full_name:"Nouril"}]} action={vi.fn()}/>);
    fireEvent.change(screen.getByLabelText("Publish to"),{target:{value:"multiple"}});
    fireEvent.click(screen.getByLabelText("Abdullah"));fireEvent.click(screen.getByLabelText("Nouril"));
    expect(new FormData(document.querySelector("form")!).getAll("recipient")).toEqual(["one","three"]);
  });
  it("offers external locations while retaining block responsibility and removing manual source choices",()=>{
    render(<ComplaintForm blocks={[{id:1,code:"A"}]} mode="create"/>);
    expect(screen.queryByRole("option",{name:"Google Form"})).not.toBeInTheDocument();
    expect(screen.queryByRole("option",{name:"Flex"})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Location type"),{target:{value:"external"}});
    fireEvent.change(screen.getByLabelText("External Area *"),{target:{value:"Futsal"}});
    expect(new FormData(document.querySelector("form")!).get("room")).toBe("Futsal");
    expect(screen.getByLabelText("Responsible block *")).toBeRequired();
  });
  it("shows maintenance evidence inside the Completed event",()=>{
    render(<JobActivityTimeline events={[{id:"done",action:"Completed",timestamp:"2026-09-28T06:00:00Z",photos:[{id:"p",url:"https://example.test/photo.jpg"}]}]}/>);
    expect(screen.getByRole("img",{name:"Maintenance completion photo"}).closest("li")?.textContent).toContain("Completed");
  });
});
