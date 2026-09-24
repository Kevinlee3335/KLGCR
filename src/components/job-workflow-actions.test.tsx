import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JobWorkflowActions } from "./job-workflow-actions";

vi.mock("@/app/(dashboard)/staff/jobs/actions", () => ({
  completeJob: vi.fn(),
  markTenantNotAvailable: vi.fn(),
  monitorJob: vi.fn(),
  resumeJob: vi.fn(),
  setPendingMaterial: vi.fn(),
  startJob: vi.fn(),
}));

describe("JobWorkflowActions", () => {
  it("keeps the source category in the completion form", () => {
    render(<JobWorkflowActions jobId="job-id" status="pending_material" returnTo="/staff/tasks?status=pending_material"/>);
    const form = screen.getByRole("button", { name: "Confirm completion" }).closest("form");
    expect(form?.querySelector('input[name="returnTo"]')).toHaveValue("/staff/tasks?status=pending_material");
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
