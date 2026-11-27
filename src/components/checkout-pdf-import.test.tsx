import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CheckoutPdfBrowserResult } from "@/lib/checkout-pdf-browser";

const state = vi.hoisted(() => ({ read: vi.fn(), prepare: vi.fn(), finish: vi.fn(), upload: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/checkout-pdf-browser", () => ({ readCheckoutPdf: state.read }));
vi.mock("@/app/(dashboard)/admin/checkouts/pdf-actions", () => ({ prepareCheckoutPdfRoom: state.prepare, finishCheckoutPdfRoom: state.finish }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: state.upload }) } }) }));
import { CheckoutPdfImport } from "./checkout-pdf-import";

function defect(sourceId = "DF-2026-0072", roomNo = "A103", photos = true, needsReview = false) {
  return {
    sourceId, inspectionId: "PM-2026-0033", originalItem: "Kebersihan Dinding", originalFinding: "Cat terkopek Dinding kulat",
    originalAction: "", sourceStatus: "Baru", description: "Wall moldy; wall paint peeling", title: `Wall moldy / paint peeling ${roomNo}`,
    reportedDate: "2026-11-04", pageNumber: 2, y: 25, needsReview,
    photos: photos ? [{ file: new File(["original evidence"], `${sourceId}.jpg`, { type: "image/jpeg" }), label: "before" as "before" | "after", sourcePage: 2 }] : [],
  };
}
function report(secondRoom = false): CheckoutPdfBrowserResult {
  return {
    sourceFileName: "UTMSPACE_First_5_Rooms.pdf", sourceSha256: "a".repeat(64), warnings: [], blockingErrors: [], skippedRooms: [],
    rooms: [
      { blockCode: "A" as const, roomNo: "A103", level: "1", defects: [defect()] },
      ...(secondRoom ? [{ blockCode: "A" as const, roomNo: "A104", level: "1", defects: [defect("DF-2026-0792", "A104", false)] }] : []),
    ],
  };
}
function choose() {
  fireEvent.change(screen.getByLabelText("UTMSPACE PDF report"), { target: { files: [new File(["PDF report"], "rooms.pdf", { type: "application/pdf" })] } });
}
function setRoomExpanded(roomNo: string, open: boolean) {
  const details = screen.getByText(`Block A · ${roomNo}`).closest("details")!;
  act(() => { details.open = open; fireEvent(details, new Event("toggle")); });
}
function largeReport(count: number): CheckoutPdfBrowserResult {
  return {
    ...report(),
    warnings: ["Source report note stays visible while rooms are collapsed."],
    rooms: Array.from({ length: count }, (_, index) => {
      const roomNo = `A${100 + index}`;
      return { blockCode: "A", roomNo, level: "1", defects: [defect(`DF-2026-${1000 + index}`, roomNo)] };
    }),
  };
}
async function preview(secondRoom = false) {
  state.read.mockResolvedValue(report(secondRoom));
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }, { id: 2, code: "B" }]} />);
  choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
}
beforeEach(() => {
  for (const mock of Object.values(state)) mock.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:source-photo");
  URL.revokeObjectURL = vi.fn();
  state.prepare.mockImplementation(async input => ({ importId: "import-1", uploads: input.defects.flatMap((item: ReturnType<typeof defect>) => item.photos.map((_photo, photoIndex) => ({ path: `import/${item.sourceId}/${photoIndex}.jpg`, token: "signed-token", sourceId: item.sourceId, photoIndex }))) }));
  state.finish.mockImplementation(async input => ({ created: true, roomId: `room-${input.roomNo}` }));
  state.upload.mockResolvedValue({ error: null });
});

it("shows a review without creating any room or uploading any evidence", async () => {
  await preview();
  expect(screen.getByRole("textbox", { name: "Defect title DF-2026-0072" })).toHaveValue("Wall moldy / paint peeling A103");
  expect(screen.getByText("Cat terkopek Dinding kulat")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Open before photo/ })).toBeInTheDocument();
  expect(state.prepare).not.toHaveBeenCalled(); expect(state.finish).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled();
});

it("sends edited English wording with unchanged Malay provenance and maps each uploaded photo to its defect", async () => {
  await preview();
  fireEvent.change(screen.getByRole("textbox", { name: "English defect description DF-2026-0072" }), { target: { value: "Wall moldy and paint peeling" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(1));
  expect(state.prepare.mock.calls[0][0]).toMatchObject({ blockId: 1, roomNo: "A103", fileHash: "a".repeat(64), defects: [{ sourceId: "DF-2026-0072", originalFinding: "Cat terkopek Dinding kulat", description: "Wall moldy and paint peeling" }] });
  expect(state.finish.mock.calls[0][2]).toEqual([{ path: "import/DF-2026-0072/0.jpg", sourceId: "DF-2026-0072", photoIndex: 0 }]);
  expect(state.upload.mock.calls[0][2]).toBeInstanceOf(File);
  expect(await screen.findByText(/Defect Form created. Ready to assign/)).toBeInTheDocument();
});

it("keeps the form unsaved when a source photo fails and allows retry", async () => {
  await preview();
  fireEvent.change(screen.getByRole("textbox", { name: "English defect description DF-2026-0072" }), { target: { value: "Wall moldy and peeling paint - checked" } });
  state.upload.mockResolvedValueOnce({ error: { message: "Connection lost" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(state.finish).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "English defect description DF-2026-0072" })).toHaveValue("Wall moldy and peeling paint - checked");
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(1));
  expect(state.finish.mock.calls[0][0].defects[0].description).toBe("Wall moldy and peeling paint - checked");
});

it("retries only the remaining room after a partial import without replaying the saved room", async () => {
  await preview(true);
  state.finish.mockResolvedValueOnce({ created: true, roomId: "saved-A103" }).mockResolvedValueOnce({ error: "Batch busy. Please retry." }).mockResolvedValueOnce({ created: true, roomId: "saved-A104" });
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (2 rooms)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A104");
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(3));
  expect(state.prepare.mock.calls.map(call => call[0].roomNo)).toEqual(["A103", "A104", "A104"]);
  expect(state.refresh).toHaveBeenCalled();
});

it("requires confirmation for an uncertain translation and retains a missing-photo note", async () => {
  const source = report(); source.rooms[0].defects = [defect("DF-2026-0072", "A103", false, true)];
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByText("No photo included for this item in the PDF.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Check and confirm the English wording for this item."));
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeEnabled();
});

it("shows the conflict reason and preserves conflicting original findings and pages when the wording is confirmed", async () => {
  const source = report();
  const item = source.rooms[0].defects[0];
  item.needsReview = true;
  item.reviewReason = "The PDF repeats this source ID with conflicting details; verify the original report.";
  item.conflictingDetails = [{ originalItem: "Kebersihan Dinding", originalFinding: "Cat masih terkopek", originalAction: "Semak semula", sourceStatus: "Belum Dibaiki", pageNumber: 7, y: 64 }];
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByText(item.reviewReason)).toBeVisible();
  expect(screen.getByText("Additional conflicting report entry · PDF page 7")).toBeInTheDocument();
  expect(screen.getByText("Cat masih terkopek")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("Check and confirm the English wording for this item."));
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(1));
  expect(state.prepare.mock.calls[0][0].defects[0].conflictingDetails).toEqual(item.conflictingDetails);
  expect(state.finish.mock.calls[0][0].defects[0].conflictingDetails).toEqual(item.conflictingDetails);
});

it("never treats an After photo as completion and skips an existing room without uploading", async () => {
  const source = report(); source.rooms[0].defects[0].sourceStatus = "Belum Dibaiki"; source.rooms[0].defects[0].photos[0].label = "after";
  state.read.mockResolvedValue(source); state.prepare.mockResolvedValue({ skipped: true, roomId: "existing-room", reason: "Room already in the current batch." });
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByText("Source After photo")).toBeInTheDocument();
  expect(screen.getByText("Belum Dibaiki")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await screen.findByText("Room already in the current batch.");
  expect(state.upload).not.toHaveBeenCalled(); expect(state.finish).not.toHaveBeenCalled();
});

it("keeps a source recheck photo labelled as recheck in the preview and import", async () => {
  const source = report(); source.rooms[0].defects[0].photos[0].label = "recheck";
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByText("Source recheck photo")).toBeInTheDocument();
  expect(screen.queryByText("Source After photo")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(1));
  expect(state.prepare.mock.calls[0][0].defects[0].photos[0].label).toBe("recheck");
});

it("ignores a completed read after the user cancels and releases preview image URLs", async () => {
  let finish!: (value: ReturnType<typeof report>) => void;
  state.read.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const rendered = render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Cancel reading" }));
  await act(async () => finish(report()));
  expect(screen.queryByText("UTMSPACE_First_5_Rooms.pdf")).toBeNull();
  state.read.mockResolvedValue(report()); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  rendered.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:source-photo");
});

it("shows an oversized-room limit before creating anything", async () => {
  const source = report();
  source.rooms[0].defects[0].photos = Array.from({ length: 21 }, (_, index) => ({
    file: new File([`photo ${index}`], `photo-${index}.jpg`, { type: "image/jpeg" }), label: "before" as const, sourcePage: 2,
  }));
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByText(/Each room supports up to 50 defects and 20 photos/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeDisabled();
  expect(state.prepare).not.toHaveBeenCalled();
});

it("validates every selected block before saving the first selected room", async () => {
  const source = report(true); source.rooms[1].blockCode = "B";
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (2 rooms)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Block B is not available");
  expect(state.prepare).not.toHaveBeenCalled();
});

it.each([100, 200])("mounts only the first room's defect cards and source photos in a %i-room report while retaining all counts", async count => {
  state.read.mockResolvedValue(largeReport(count));
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getAllByText(/^Block A · A\d+$/)).toHaveLength(count);
  expect(screen.getAllByRole("textbox")).toHaveLength(2);
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  expect(within(screen.getByLabelText("Selected report totals")).getAllByText(String(count))).toHaveLength(3);
  expect(screen.getByText("Source report note stays visible while rooms are collapsed.")).toBeVisible();
  expect(screen.getByRole("button", { name: `Create Defect Forms (${count} rooms)` })).toBeEnabled();
  setRoomExpanded("A101", true);
  await screen.findByRole("textbox", { name: "Defect title DF-2026-1001" });
  expect(screen.getAllByRole("textbox")).toHaveLength(4);
  expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
  setRoomExpanded("A101", false);
  await waitFor(() => expect(screen.queryByRole("textbox", { name: "Defect title DF-2026-1001" })).toBeNull());
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  setRoomExpanded("A100", false);
  await waitFor(() => expect(screen.queryAllByRole("textbox")).toHaveLength(0));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});

it("retains English edits and review confirmation when a room is collapsed, reopened and saved", async () => {
  const source = largeReport(2);
  source.rooms[0].defects[0].needsReview = true;
  source.rooms[1].defects[0].needsReview = true;
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  expect(screen.getByLabelText("Needs review: 1 defect in A100")).toBeVisible();
  expect(screen.getByLabelText("Needs review: 1 defect in A101")).toBeVisible();
  fireEvent.change(screen.getByRole("textbox", { name: "Defect title DF-2026-1000" }), { target: { value: "Wall moldy A100 - checked" } });
  fireEvent.change(screen.getByRole("textbox", { name: "English defect description DF-2026-1000" }), { target: { value: "Wall moldy and paint peeling - checked" } });
  fireEvent.click(screen.getByLabelText("Check and confirm the English wording for this item."));
  expect(screen.queryByLabelText("Needs review: 1 defect in A100")).toBeNull();
  setRoomExpanded("A100", false);
  await waitFor(() => expect(screen.queryAllByRole("textbox")).toHaveLength(0));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  setRoomExpanded("A101", true);
  await screen.findByRole("textbox", { name: "Defect title DF-2026-1001" });
  fireEvent.click(screen.getByLabelText("Check and confirm the English wording for this item."));
  setRoomExpanded("A100", true);
  expect(await screen.findByRole("textbox", { name: "Defect title DF-2026-1000" })).toHaveValue("Wall moldy A100 - checked");
  expect(screen.getByRole("textbox", { name: "English defect description DF-2026-1000" })).toHaveValue("Wall moldy and paint peeling - checked");
  expect(screen.getAllByLabelText("Check and confirm the English wording for this item.").every(element => (element as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (2 rooms)" }));
  await waitFor(() => expect(state.finish).toHaveBeenCalledTimes(2));
  expect(state.prepare.mock.calls[0][0].defects[0]).toMatchObject({ title: "Wall moldy A100 - checked", description: "Wall moldy and paint peeling - checked" });
  setRoomExpanded("A100", false); setRoomExpanded("A100", true);
  expect(await screen.findByRole("textbox", { name: "Defect title DF-2026-1000" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Create Defect Forms (0 rooms)" })).toBeDisabled();
});

it("blocks creation for a partial diagnostic result containing source accuracy errors", async () => {
  const source = report();
  source.blockingErrors = ["A103 declares 6 defects but only 5 source details were found."];
  source.warnings = ["Original report note remains visible."];
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  const warning = await screen.findByRole("alert");
  expect(warning).toHaveTextContent("This PDF cannot be imported.");
  expect(warning).toHaveTextContent(source.blockingErrors[0]);
  expect(screen.getByText(source.warnings[0])).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Defect title DF-2026-0072" })).toBeInTheDocument();
  const create = screen.getByRole("button", { name: "Create Defect Forms (1 room)" });
  expect(create).toBeDisabled(); fireEvent.click(create);
  expect(state.prepare).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(state.finish).not.toHaveBeenCalled();
});

it("fails closed when the report result has no source-validation outcome", async () => {
  const { blockingErrors: _blockingErrors, ...unchecked } = report();
  state.read.mockResolvedValue(unchecked);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  expect(await screen.findByRole("alert")).toHaveTextContent("The PDF check could not be confirmed.");
  expect(screen.getByRole("button", { name: "Create Defect Forms (1 room)" })).toBeDisabled();
  expect(state.prepare).not.toHaveBeenCalled();
});

it.each(["sourceId", "reportedDate", "originalFinding"] as const)("validates %s in a later room before preparing any earlier room", async field => {
  const source = report(true);
  source.rooms[1].defects[0][field] = field === "originalFinding" ? "" : "invalid source value";
  state.read.mockResolvedValue(source);
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  fireEvent.change(screen.getByRole("textbox", { name: "English defect description DF-2026-0072" }), { target: { value: "Wall moldy - checked" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (2 rooms)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("A104");
  expect(screen.getByRole("textbox", { name: "English defect description DF-2026-0072" })).toHaveValue("Wall moldy - checked");
  expect(state.prepare).not.toHaveBeenCalled(); expect(state.upload).not.toHaveBeenCalled(); expect(state.finish).not.toHaveBeenCalled();
});

it("shows completed upload counts and waits for the last upload before the save stage", async () => {
  const source = report();
  source.rooms[0].defects[0].photos.push({ file: new File(["after"], "after.jpg", { type: "image/jpeg" }), label: "after", sourcePage: 2 });
  let finishUpload!: (result: { error: null }) => void;
  let finishSave!: (result: { created: boolean; roomId: string }) => void;
  state.read.mockResolvedValue(source);
  state.upload.mockImplementation((path: string) => path.endsWith("/1.jpg") ? new Promise(resolve => { finishUpload = resolve; }) : Promise.resolve({ error: null }));
  state.finish.mockImplementation(() => new Promise(resolve => { finishSave = resolve; }));
  render(<CheckoutPdfImport blocks={[{ id: 1, code: "A" }]} />); choose();
  await screen.findByText("UTMSPACE_First_5_Rooms.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Create Defect Forms (1 room)" }));
  await screen.findByText("Uploading A103 photos: 1 of 2 · room 1 of 1 remaining…");
  expect(state.finish).not.toHaveBeenCalled();
  await act(async () => finishUpload({ error: null }));
  await screen.findByText("Saving A103 with its defect photos · room 1 of 1 remaining…");
  expect(screen.getByRole("button", { name: "Creating Defect Forms…" })).toBeDisabled();
  await act(async () => finishSave({ created: true, roomId: "room-A103" }));
  await screen.findByText(/Defect Form created. Ready to assign/);
});
