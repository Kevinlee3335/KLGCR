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
    ["Bungalow XA3/X3", "Futsal", "Gazebo", "KLG Security Main Post", "Commercial Centre", "Gymnasium", "Outdoor Exercise Station", "Substation PE45/46"].forEach((area) => {
      expect(external).toHaveTextContent(area);
    });
    expect(screen.queryByLabelText("Block *")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Location Type *"), { target: { value: "room" } });
    expect(screen.getByLabelText("Room No. *")).toBeRequired();
    expect(screen.getByLabelText("Defect Item *")).toHaveTextContent("Ceiling Fan");
    expect(screen.getByLabelText("Defect Item *")).toHaveTextContent("Wardrobe");

    fireEvent.change(screen.getByLabelText("Location Type *"), { target: { value: "bathroom" } });
    expect(screen.getByLabelText("Room No. / Bathroom Location *")).toBeRequired();
    expect(screen.getByLabelText("Defect Item *")).toHaveTextContent("Water Tap / Sink Tap");
    expect(screen.getByLabelText("Defect Item *")).toHaveTextContent("Toilet Seat");
  });
});
