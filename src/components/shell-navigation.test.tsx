import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MobileNavigationDrawer } from "./shell-navigation";

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
