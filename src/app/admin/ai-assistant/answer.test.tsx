import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiAnswer } from "./answer";
it("renders readable headings/lists while keeping HTML and scripts inert", () => {
  const { container } = render(<AiAnswer text={'### Complaints\n* **ELECTRICAL:** 23\n<script>alert(1)</script>\nItem `P00003`'}/>);
  expect(screen.getByRole("heading", { name: "Complaints" })).toBeInTheDocument();
  expect(screen.getByRole("listitem")).toHaveTextContent("ELECTRICAL: 23");
  expect(container.querySelector("script")).toBeNull(); expect(container.querySelector("code")).toHaveTextContent("P00003");
});

it("renders escaped table pipes with blank lines and keeps table content inert", () => {
  const { container } = render(<AiAnswer text={'\\| Code | Balance |\n\n\\| :--- | :---: |\n\n\\| `LED` | 2 |\n\n\\| <img src=x onerror=alert(1)> | 0 |'}/>);
  expect(screen.getByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Balance" })).toBeInTheDocument();
  expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
  expect(container.querySelector("img")).toBeNull();
});
