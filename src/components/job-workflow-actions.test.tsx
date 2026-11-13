import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkJobMaterialApproval } from "@/app/(dashboard)/staff/jobs/actions";
import { JobWorkflowActions } from "./job-workflow-actions";

vi.mock("@/app/(dashboard)/staff/jobs/actions", () => ({
  checkJobMaterialApproval: vi.fn(),
  completeJob: vi.fn(),
  markTenantNotAvailable: vi.fn(),
  monitorJob: vi.fn(),
  resumeJob: vi.fn(),
  setPendingMaterial: vi.fn(),
  startJob: vi.fn(),
}));

const checkApproval = vi.mocked(checkJobMaterialApproval);

describe("JobWorkflowActions", () => {
  beforeEach(() => {
    checkApproval.mockReset();
    checkApproval.mockResolvedValue({ pendingApproval: false });
  });

  it("opens an eligible completion form and keeps the source category", async () => {
    render(<JobWorkflowActions jobId="job-id" status="pending_material" returnTo="/staff/tasks?status=pending_material"/>);
    const complete = screen.getByText("Complete Job");
    const details = complete.closest("details");
    expect(details).not.toHaveAttribute("open");
    fireEvent.click(complete);
    await waitFor(() => expect(details).toHaveAttribute("open"));
    expect(checkApproval).toHaveBeenCalledWith("job-id");
    const form = screen.getByRole("button", { name: "Confirm completion" }).closest("form");
    expect(form?.querySelector('input[name="returnTo"]')).toHaveValue("/staff/tasks?status=pending_material");
    expect(form?.querySelector('input[type="file"][multiple]')).toBeInTheDocument();
    expect(form?.querySelector('input[capture="environment"]')).toBeInTheDocument();
  });

  it("shows the approved popup copy, blocks the form, and checks again after approval", async () => {
    checkApproval.mockResolvedValueOnce({ pendingApproval: true });
    const { container } = render(<JobWorkflowActions jobId="job-id" status="in_progress"/>);
    const complete = screen.getByText("Complete Job");
    const details = complete.closest("details");
    const dialog = container.querySelector("dialog")!;
    dialog.showModal = vi.fn(() => { dialog.open = true; });
    dialog.close = vi.fn(() => { dialog.open = false; });

    fireEvent.click(complete);
    expect(details).not.toHaveAttribute("open");
    const alert = await screen.findByRole("alertdialog", { name: "Cannot Complete Job" });
    expect(alert).toHaveAccessibleDescription("Material request is still pending approval . Please wait for Admin to approve the required materials before completing this job.");
    expect(details).not.toHaveAttribute("open");
    const [dismiss] = within(alert).getAllByRole("button");
    expect(dismiss).toHaveTextContent("PLEASE CONTACT WITH ADMIN");
    expect(within(alert).getAllByRole("button")).toHaveLength(1);
    fireEvent.click(dismiss);
    expect(dialog).not.toHaveAttribute("open");

    fireEvent.click(complete);
    await waitFor(() => expect(details).toHaveAttribute("open"));
    expect(checkApproval).toHaveBeenCalledTimes(2);
  });

  it("keeps the form closed if the approval lookup fails", async () => {
    checkApproval.mockResolvedValueOnce({ error: "Unable to verify this job." });
    render(<JobWorkflowActions jobId="job-id" status="under_monitoring"/>);
    const complete = screen.getByText("Complete Job");
    fireEvent.click(complete);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to verify this job.");
    expect(complete.closest("details")).not.toHaveAttribute("open");
  });

  it("shows Start Job and Tenant Not Available for an assigned appointment job", () => {
    render(<JobWorkflowActions jobId="job-id" status="assigned" hasActionableAppointment/>);

    expect(screen.getByRole("button", { name: "Start Job" })).toBeInTheDocument();
    expect(screen.getByText("Tenant Not Available")).toBeInTheDocument();
  });

  it("shows only Start Job for an assigned job without an appointment", () => {
    render(<JobWorkflowActions jobId="job-id" status="assigned"/>);

    expect(screen.getByRole("button", { name: "Start Job" })).toBeInTheDocument();
    expect(screen.queryByText("Tenant Not Available")).not.toBeInTheDocument();
  });
});
