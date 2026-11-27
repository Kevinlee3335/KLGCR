import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DailyTaskForm } from "./daily-task-form";
it("shows the inferred department when choosing an employee with no stored category", () => {
  render(<DailyTaskForm date="2026-10-14" staff={[{id:"nancy",full_name:"NANCY",role:"cleaner",daily_task_category:null}]} />);
  fireEvent.change(screen.getByLabelText(/Assign to/), { target: { value: "nancy" } });
  expect(screen.getByText("Department: Housekeeping Task")).toBeInTheDocument();
});

afterEach(()=>{vi.useRealTimers();});
it("submits the selected Once date and can reset it to today in Malaysia",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-14T18:00:00Z"));
  const {container}=render(<DailyTaskForm date="2026-10-15" staff={[]} />);
  const input=screen.getByLabelText(/Work date/) as HTMLInputElement;
  expect(input.value).toBe("2026-10-15");
  fireEvent.change(input,{target:{value:"2026-10-21"}});
  expect(new FormData(container.querySelector("form")!).getAll("date")).toEqual(["2026-10-21"]);
  fireEvent.click(screen.getByRole("button",{name:"Today"}));
  expect(input.value).toBe("2026-10-15");
});
it("preserves recurrence dates and restores the chosen date when switching back to Once",()=>{
  const {container}=render(<DailyTaskForm date="2026-10-14" staff={[]} />);
  fireEvent.change(screen.getByLabelText(/Work date/),{target:{value:"2026-10-21"}});
  fireEvent.change(screen.getByLabelText("Repeat"),{target:{value:"weekly"}});
  expect(screen.queryByLabelText(/Work date/)).toBeNull();
  expect(new FormData(container.querySelector("form")!).getAll("date")).toEqual(["2026-10-14"]);
  fireEvent.change(screen.getByLabelText("Repeat"),{target:{value:"once"}});
  expect(new FormData(container.querySelector("form")!).getAll("date")).toEqual(["2026-10-21"]);
});

it("lets an admin start typing while employees load and still requires a selection", async () => {
  const employees = [{ id: "employee-1", full_name: "Employee One", role: "cleaner" }];
  let finish!: (value: typeof employees) => void;
  const staff = new Promise<typeof employees>(resolve => { finish = resolve; });
  await act(async () => { render(<DailyTaskForm date="2026-11-27" staff={staff} />); });
  const title = screen.getByLabelText("Task");
  const form = title.closest("form")!;
  fireEvent.change(title, { target: { value: "Inspect storeroom" } });
  expect(screen.getByText("Loading employees…")).toBeInTheDocument();
  expect(form.checkValidity()).toBe(false);
  await act(async () => { finish(employees); await staff; });
  await screen.findByRole("option", { name: "Employee One" });
  expect(screen.getByLabelText("Task")).toHaveValue("Inspect storeroom");
  expect(form.checkValidity()).toBe(false);
  fireEvent.change(screen.getByLabelText(/Assign to/), { target: { value: "employee-1" } });
  expect(form.checkValidity()).toBe(true);
  expect(new FormData(form).get("assignedTo")).toBe("employee-1");
});
