import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard";

describe("role dashboards", () => {
  it("shows live admin overview with navigable cards", () => {
    render(<Dashboard kind="admin" name="KLG Admin" values={[2, 3, 1, 4]} hrefs={["/admin/complaints", "/admin/jobs?a", "/admin/jobs?b", "/admin/jobs?c"]}/>);
    expect(screen.getByRole("link", { name: /New complaints/i })).toHaveAttribute("href", "/admin/complaints");
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("shows assigned blocks on staff mobile dashboard", () => {
    render(<Dashboard kind="staff" name="Abdullah" blocks="Block A & Block B" values={[1, 0, 0, 0]}/>);
    expect(screen.getByText("My tasks — Block A & Block B")).toBeInTheDocument();
    expect(screen.queryByText("New complaints")).not.toBeInTheDocument();
  });
});
