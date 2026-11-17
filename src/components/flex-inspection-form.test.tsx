import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FlexGroup, FlexInspectionSnapshot, InspectionGroup } from "@/lib/flex-inspection";
import { emptyFlexReview } from "@/lib/flex-inspection-review";
import { FlexInspectionForm } from "./flex-inspection-form";

const { save, saveAb, verify } = vi.hoisted(() => ({ save: vi.fn(), saveAb: vi.fn(), verify: vi.fn() }));
vi.mock("@/lib/flex-inspection-actions", () => ({ saveFlexInspection: save, saveAbFireSafetyInspection: saveAb }));
vi.mock("@/lib/flex-inspection-review-actions", () => ({ verifyFlexInspection: verify }));

const inspection: FlexInspectionSnapshot = {
  period: "2026-11",
  revision: 0,
  exceptions: {},
  inspectionDate: null,
  inspectedByName: null,
  completedAt: null,
};
const groups: FlexGroup[] = [
  {
    id: "fire-c-A5", report: "fire-extinguisher", block: "C", level: 1, location: "Corridor Wing A",
    quantity: 2, sourceCell: "A5", units: [{ id: "fire-c-A5-1", label: "DP 1/2" }, { id: "fire-c-A5-2", label: "DP 2/2" }],
  },
  {
    id: "light-c-Q7", report: "emergency-light", block: "C", level: 2, location: "Corridor Wing A",
    quantity: 1, sourceCell: "Q7", units: [{ id: "light-c-Q7-1", label: "Unit 1" }],
  },
  {
    id: "exit-d-F25", report: "exit-sign", block: "D", level: 1, location: "Lobby",
    quantity: 1, sourceCell: "F25", units: [{ id: "exit-d-F25-1", label: "Unit 1" }],
  },
  {
    id: "light-d-K33", report: "emergency-light", block: "D", level: null, location: "Canteen",
    quantity: 1, sourceCell: "K33", units: [{ id: "light-d-K33-1", label: "Unit 1" }],
  },
];
const today = "2026-11-16";

beforeEach(() => {
  sessionStorage.clear();
  save.mockReset();
  saveAb.mockReset();
  verify.mockReset();
});
afterEach(cleanup);

function markFault(unit: RegExp) {
  fireEvent.click(within(screen.getByRole("group", { name: unit })).getByRole("button", { name: "Fault" }));
}

it("keeps individual faults across level and block filters and requires remarks before showing PDF reports", async () => {
  save.mockResolvedValue({
    ok: true,
    inspection: {
      ...inspection,
      revision: 1,
      inspectionDate: today,
      inspectedByName: "Inspector",
      completedAt: today + "T03:00:00Z",
      exceptions: { "fire-c-A5-2": "Low pressure", "light-d-K33-1": "Does not turn on" },
    },
  });
  render(<FlexInspectionForm inspection={inspection} groups={groups} today={today} />);

  const unitOne = screen.getByRole("group", { name: /DP 1\/2/ });
  expect(within(unitOne).getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
  markFault(/DP 2\/2/);
  expect(within(unitOne).getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.change(screen.getByRole("textbox", { name: /DP 2\/2/ }), { target: { value: "Low pressure" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Level" }), { target: { value: "2" } });
  expect(screen.getByRole("group", { name: /Block C, Level 2/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Block D" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Level" }), { target: { value: "common" } });
  markFault(/Canteen/);

  fireEvent.click(screen.getByRole("button", { name: "Complete inspection" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a remark");
  expect(screen.getByRole("textbox", { name: /DP 2\/2/ })).toHaveValue("Low pressure");
  const canteenRemark = screen.getByRole("textbox", { name: /Canteen/ });
  expect(canteenRemark).toHaveAttribute("aria-invalid", "true");
  fireEvent.change(canteenRemark, { target: { value: "Does not turn on" } });

  fireEvent.click(screen.getByRole("button", { name: "Complete inspection" }));
  expect(save).toHaveBeenCalledWith({
    period: inspection.period, revision: 0, inspectionDate: today, complete: true,
    exceptions: { "fire-c-A5-2": "Low pressure", "light-d-K33-1": "Does not turn on" },
  });
  const reports = await screen.findAllByRole("link", { name: / PDF$/ });
  expect(reports.map((link) => link.getAttribute("href"))).toEqual([
    "/api/flex-inspections/2026-11/fire-extinguisher",
    "/api/flex-inspections/2026-11/exit-sign",
    "/api/flex-inspections/2026-11/emergency-light",
  ]);
  expect(screen.queryByRole("button", { name: "Complete inspection" })).not.toBeInTheDocument();
});

it("saves a draft with a pending remark and preserves changes when a newer revision exists", async () => {
  save.mockResolvedValueOnce({
    ok: true,
    inspection: { ...inspection, revision: 1, inspectionDate: today, exceptions: { "fire-c-A5-2": "" } },
  }).mockResolvedValueOnce({
    ok: false,
    code: "conflict",
    message: "A newer draft was saved.",
  });
  render(<FlexInspectionForm inspection={inspection} groups={groups} today={today} />);
  markFault(/DP 2\/2/);

  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Draft saved.");
  expect(save).toHaveBeenCalledWith({
    period: inspection.period, revision: 0, inspectionDate: today, complete: false,
    exceptions: { "fire-c-A5-2": "" },
  });

  fireEvent.change(screen.getByRole("textbox", { name: /DP 2\/2/ }), { target: { value: "Low pressure" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("A newer draft was saved.");
  expect(save.mock.lastCall?.[0].revision).toBe(1);
  expect(screen.getByRole("textbox", { name: /DP 2\/2/ })).toHaveValue("Low pressure");
  expect(screen.getByRole("button", { name: "Reload saved inspection" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
});

it("lets the trial simulate both verifications in either order, including after a reload", async () => {
  const completed = {
    ...inspection, revision: 1, inspectionDate: today, inspectedByName: "Trial Inspector",
    completedAt: today + "T03:00:00Z",
  };
  save.mockResolvedValue({ ok: true, inspection: completed });
  const recipients = {
    to: "inspection-fixture@flex.com",
    cc: ["inspection-fixture-cc1@flex.com", "inspection-fixture-cc2@flex.com"] as [string, string],
  };
  const trial = <FlexInspectionForm inspection={inspection} groups={groups} today={today} preview
    review={emptyFlexReview} recipients={recipients} />;
  const first = render(trial);
  fireEvent.click(screen.getByRole("button", { name: "Complete inspection" }));
  await screen.findByRole("button", { name: "Emergency Light PDF" });
  const verification = within(screen.getByRole("region", { name: "Flex verification" }));
  expect(verification.getByText(recipients.to)).toBeInTheDocument();
  expect(verification.getByText(recipients.cc[0])).toBeInTheDocument();
  expect(verification.getByText(recipients.cc[1])).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Verify as Fikri" }));
  expect(screen.getByText(/both verifications are required/i)).toBeInTheDocument();
  first.unmount();

  render(trial);
  expect(screen.queryByRole("button", { name: "Verify as Fikri" })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Verify as Kevin" }));
  expect(screen.getByText(/email is simulated/i)).toBeInTheDocument();
  expect(verify).not.toHaveBeenCalled();
});

it("completes A/B through its own action and links all four PDFs and the Documents archive", async () => {
  const abGroups: InspectionGroup[] = [
    {
      id: "hose-a-b6", report: "hose-reel", block: "A", level: 1, location: "Wing A",
      quantity: 1, sourceCell: "B6", units: [{ id: "hose-a-b6-1", label: "Unit 1" }],
    },
    {
      id: "light-a-b9", report: "emergency-light", block: "A", level: 4, location: "Lobby",
      quantity: 0, sourceCell: "B9", units: [], note: "No emergency light",
    },
    {
      id: "fire-other-b50", report: "fire-extinguisher", block: "Other", level: 1, location: "Bungalow XA3",
      quantity: 1, sourceCell: "B50", units: [{ id: "fire-other-b50-1", label: "DP 1" }],
    },
  ];
  saveAb.mockResolvedValue({
    ok: true,
    inspection: {
      ...inspection, revision: 1, inspectionDate: today, inspectedByName: "Inspector",
      completedAt: today + "T03:00:00Z", exceptions: { "fire-other-b50-1": "Low pressure" },
    },
  });
  render(<FlexInspectionForm inspection={inspection} groups={abGroups} today={today} scope="ab"
    review={emptyFlexReview} reviewer="kevin" />);

  fireEvent.change(screen.getByRole("combobox", { name: "Level" }), { target: { value: "4" } });
  expect(screen.getByText("No emergency light")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Good" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Other areas" }));
  markFault(/Bungalow XA3/);
  fireEvent.change(screen.getByRole("textbox", { name: /Bungalow XA3/ }), { target: { value: "Low pressure" } });
  fireEvent.click(screen.getByRole("button", { name: "Complete inspection" }));

  const reports = await screen.findAllByRole("link", { name: / PDF$/ });
  expect(reports.map((link) => link.getAttribute("href"))).toEqual([
    "/api/flex-inspections/2026-11/hose-reel?scope=ab",
    "/api/flex-inspections/2026-11/fire-extinguisher?scope=ab",
    "/api/flex-inspections/2026-11/exit-sign?scope=ab",
    "/api/flex-inspections/2026-11/emergency-light?scope=ab",
  ]);
  expect(saveAb).toHaveBeenCalledWith({
    period: inspection.period, revision: 0, inspectionDate: today, complete: true,
    exceptions: { "fire-other-b50-1": "Low pressure" },
  });
  expect(save).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Flex verification" })).toBeNull();
  expect(screen.getByRole("link", { name: "Open Documents archive" }))
    .toHaveAttribute("href", "/documents/fire-safety-inspections/ab");
});
