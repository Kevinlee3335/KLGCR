import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { markSupplierEmailRead } from "@/app/(dashboard)/documents/suppliers/actions";
import { SupplierEmailRead } from "./supplier-email-read";

vi.mock("@/app/(dashboard)/documents/suppliers/actions", () => ({ markSupplierEmailRead: vi.fn().mockResolvedValue(undefined) }));

it("marks the opened email just once even when React replays the mount effect", () => {
  const view = render(<StrictMode><SupplierEmailRead id="abcde12345"/></StrictMode>);
  view.rerender(<StrictMode><SupplierEmailRead id="abcde12345"/></StrictMode>);
  view.rerender(<StrictMode><SupplierEmailRead id="abcde67890"/></StrictMode>);
  expect(vi.mocked(markSupplierEmailRead).mock.calls).toEqual([["abcde12345"], ["abcde67890"]]);
});
