import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prepare: vi.fn(), complete: vi.fn(), upload: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(dashboard)/staff/daily-tasks/actions", () => ({
  prepareDailyTaskEvidence: mocks.prepare,
  completeDailyTask: mocks.complete,
}));
vi.mock("@/app/(dashboard)/admin/daily-tasks/evidence-actions", () => ({
  prepareAdminDailyTaskEvidence: vi.fn(),
  completeAdminDailyTask: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: mocks.upload }) } }),
}));

import { DailyTaskCompletionForm } from "./daily-task-completion-form";

it("keeps photo encoding serial while transferring up to three photos together", async () => {
  const release: Array<(result: { error: null }) => void> = [];
  const uploads = ["one", "two", "three", "four"].map(path => ({ path, token: "signed-token" }));
  let activeImages = 0;
  let peakImages = 0;
  mocks.prepare.mockResolvedValue({ uploads });
  mocks.upload.mockImplementation(() => new Promise(resolve => release.push(resolve)));
  mocks.complete.mockResolvedValue({ ok: true });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL() { return "blob:test"; }
    static revokeObjectURL() {}
  });
  vi.stubGlobal("Image", class {
    naturalWidth = 3200;
    naturalHeight = 2400;
    onload?: () => void;
    set src(url: string) {
      if (!url) return;
      activeImages += 1;
      peakImages = Math.max(peakImages, activeImages);
      queueMicrotask(() => {
        activeImages -= 1;
        this.onload?.();
      });
    }
  });
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  const encode = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(callback => {
    queueMicrotask(() => callback(new Blob(["photo"], { type: "image/jpeg" })));
  });

  try {
    render(<DailyTaskCompletionForm taskId={42}/>);
    fireEvent.change(screen.getByLabelText("Upload Photos"), {
      target: { files: uploads.map(({ path }) => new File(["original"], `${path}.png`, { type: "image/png" })) },
    });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Task finished" } });
    fireEvent.submit(screen.getByRole("button", { name: "Confirm Completion" }).closest("form")!);
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(3));
    expect(peakImages).toBe(1);
    expect(mocks.complete).not.toHaveBeenCalled();
    expect(encode).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);

    release[2]({ error: null });
    release[0]({ error: null });
    release[1]({ error: null });
    await waitFor(() => expect(mocks.upload).toHaveBeenCalledTimes(4));
    release[3]({ error: null });
    await waitFor(() => expect(mocks.complete).toHaveBeenCalledWith(42, "Task finished", ["one", "two", "three", "four"]));
  } finally {
    encode.mockRestore();
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});
