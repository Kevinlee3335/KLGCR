import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CleanerComplaintForm } from "./cleaner-complaint-form";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
const mocks = vi.hoisted(() => ({ prepare: vi.fn(), cancel: vi.fn(), finalize: vi.fn() }));
vi.mock("@/app/(dashboard)/staff/complaints/new/actions", () => ({
  prepareCleanerComplaint: mocks.prepare,
  finalizeCleanerComplaint: mocks.finalize,
  cancelCleanerComplaint: mocks.cancel,
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

  it("prepares the draft while decoding the photo and cleans it up on a decoding failure", async () => {
    const draft = { complaintId: "complaint-1", complaintNo: "C-1", path: "complaints/complaint-1/photo.jpg", token: "token" };
    let finishDraft!: (value: typeof draft) => void;
    let failImage!: () => void;
    mocks.prepare.mockReturnValue(new Promise(resolve => { finishDraft = resolve; }));
    mocks.cancel.mockResolvedValue(undefined);
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL() { return "blob:test"; }
      static revokeObjectURL() {}
    });
    vi.stubGlobal("Image", class {
      onerror?: () => void;
      set src(url: string) {
        if (url) failImage = () => this.onerror?.();
      }
    });
    try {
      render(<CleanerComplaintForm reporterName="Ariffin" blocks={[{ id: 1, code: "A" }]}/>);
      fireEvent.change(screen.getByLabelText("Upload Photo"), {
        target: { files: [new File(["bad image"], "evidence.jpg", { type: "image/jpeg" })] },
      });
      fireEvent.submit(screen.getByRole("button", { name: "Send to Admin" }).closest("form")!);
      expect(mocks.prepare).toHaveBeenCalledOnce();
      expect(typeof failImage).toBe("function");
      failImage();
      finishDraft(draft);
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("photo format cannot be read"));
      expect(mocks.cancel).toHaveBeenCalledWith(draft.complaintId, draft.path);
      expect(mocks.finalize).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});


it("lets a cleaner type and select a photo before the required block options arrive", async () => {
  const blocks = Promise.withResolvers<{id: number; code: string}[]>();
  await act(async () => { render(<CleanerComplaintForm reporterName="Cleaner" blocks={blocks.promise}/>); });
  const notes = screen.getByPlaceholderText("Explain what is broken and where it is.");
  await act(async () => { fireEvent.change(notes, { target: { value: "Door handle loose" } }); });
  const photo = new File(["test"], "door.png", { type: "image/png" });
  await act(async () => { fireEvent.change(screen.getByLabelText("Upload Photo"), {target: {files: [photo]}}); });
  expect(screen.getByLabelText("Block *")).toBeInvalid();
  await act(async () => blocks.resolve([{id: 1, code: "A"}]));
  expect(await screen.findByRole("option", {name:"Block A"})).toBeInTheDocument();
  expect(notes).toHaveValue("Door handle loose");
  expect(screen.getByText(/Photo selected.*door.png/)).toBeInTheDocument();
});
