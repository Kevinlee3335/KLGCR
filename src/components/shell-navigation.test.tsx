import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MobileNavigationDrawer, ShellLink } from "./shell-navigation";

const linkStatus = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/link")>(),
  useLinkStatus: () => linkStatus,
}));

it("closes the mobile drawer from its backdrop and Escape, then returns focus to the menu", () => {
  const { container } = render(<MobileNavigationDrawer><a href="/admin">Dashboard</a></MobileNavigationDrawer>);
  const drawer = container.querySelector("details");
  const menu = screen.getByLabelText("Navigation menu");

  fireEvent.click(menu);
  expect(drawer).toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Close navigation menu" }));
  expect(drawer).not.toHaveAttribute("open");
  expect(menu).toHaveFocus();

  fireEvent.click(menu);
  const link = screen.getByRole("link", { name: "Dashboard" });
  link.focus();
  fireEvent.keyDown(link, { key: "Escape" });
  expect(drawer).not.toHaveAttribute("open");
  expect(menu).toHaveFocus();
});

it("indicates when an in-page link is pending", () => {
  linkStatus.pending = true;
  render(<ShellLink href="/staff/material-request">Materials</ShellLink>);
  expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
  linkStatus.pending = false;
});
