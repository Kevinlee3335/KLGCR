import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { DailyTaskForm } from "./daily-task-form";
it("shows the inferred department when choosing an employee with no stored category", () => {
  render(<DailyTaskForm date="2026-10-14" staff={[{id:"nancy",full_name:"NANCY",role:"cleaner",daily_task_category:null}]} />);
  fireEvent.change(screen.getByLabelText(/Assign to/), { target: { value: "nancy" } });
  expect(screen.getByText("Department: Housekeeping Task")).toBeInTheDocument();
});
