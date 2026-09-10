import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssignmentForm } from "./complaint-form";

vi.mock("@/app/(dashboard)/admin/complaints/actions", () => ({
  assignComplaint: vi.fn(),
  createComplaint: vi.fn(),
  reviewComplaint: vi.fn(),
}));

const staff = [{ id: "00000000-0000-4000-8000-000000000001", full_name: "Alex Staff" }];

describe("AssignmentForm", () => {
  it("requires an explicit appointment when room access is denied", () => {
    render(<AssignmentForm complaintId="complaint-id" eligible={staff} requiresAppointment/>);

    expect(screen.getByRole("heading", { name: "Maintenance Appointment" })).toBeInTheDocument();
    expect(screen.getByLabelText("Maintenance Date *")).toBeRequired();
    expect(screen.getByLabelText("Maintenance Time *")).toBeRequired();
    expect(screen.getByLabelText("Assigned Staff *")).toBeRequired();
    expect(screen.getByRole("button", { name: "Approve & create job" })).toBeInTheDocument();
  });

  it("does not require appointment fields when room access is granted", () => {
    render(<AssignmentForm complaintId="complaint-id" eligible={staff}/>);

    expect(screen.queryByLabelText("Maintenance Date *")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Maintenance Time *")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Maintenance Date")).not.toBeRequired();
    expect(screen.getByLabelText("Maintenance Time")).not.toBeRequired();
    expect(screen.getByLabelText("Assigned Staff *")).toBeRequired();
  });
});
