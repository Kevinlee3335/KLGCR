// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/daily-task-completion-form", () => ({ DailyTaskCompletionForm: ({ supplemental }: { supplemental: boolean }) => <div>{supplemental ? "Supplemental uploader" : "Completion uploader"}</div> }));
import { AdminDailyTaskControls } from "./admin-daily-task-controls";
afterEach(cleanup);
const props = { taskId: 42, title: "Check pump", date: "2026-10-08", category: "operation" };
describe("Admin Daily Task completion controls", () => {
  it("replaces the quick status update with photo completion when Completed is selected", () => {
    render(<AdminDailyTaskControls {...props} status="accepted" />);
    fireEvent.change(screen.getByLabelText("Task status"), { target: { value: "completed" } });
    expect(screen.getByText("Completion uploader")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
  });
  it("allows photos to be added after completion", () => {
    render(<AdminDailyTaskControls {...props} status="completed" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Photos" }));
    expect(screen.getByText("Supplemental uploader")).toBeTruthy();
  });
  it("cancels deletion when the user declines confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminDailyTaskControls {...props} status="accepted" />);
    const form = screen.getByRole("button", { name: "Delete Check pump" }).closest("form")!;
    expect(fireEvent.submit(form)).toBe(false);
  });
});
