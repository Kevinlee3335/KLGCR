import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CleanerComplaintForm } from "./cleaner-complaint-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/staff/complaints/new/actions", () => ({
  prepareCleanerComplaint: vi.fn(),
  finalizeCleanerComplaint: vi.fn(),
  cancelCleanerComplaint: vi.fn(),
}));

describe("CleanerComplaintForm", () => {
  it("offers all common and external areas", () => {
    render(<CleanerComplaintForm reporterName="Ariffin" blocks={[{ id: 1, code: "A" }]}/>);

    expect(screen.getByLabelText("Common Area *")).toHaveTextContent("Balcony");
    expect(screen.getByLabelText("Common Area *")).toHaveTextContent("Lift");

    fireEvent.change(screen.getByLabelText("Location Type *"), { target: { value: "external" } });
    const external = screen.getByLabelText("External Area *");
    expect(external).toHaveTextContent("Bungalow XA3/X3");
    expect(external).toHaveTextContent("Futsal");
    expect(external).toHaveTextContent("Substation PE45/46");
    expect(screen.queryByLabelText("Block *")).not.toBeInTheDocument();
  });
});
