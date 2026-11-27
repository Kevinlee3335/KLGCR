import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
import type { Profile } from "@/lib/types";

vi.mock("./notification-bell", () => ({ NotificationBell: () => null }));
vi.mock("./logout-form", () => ({ LogoutForm: () => null }));
vi.mock("./shell-navigation", async importOriginal => ({
  ...await importOriginal<typeof import("./shell-navigation")>(),
  ShellLink: (props: ComponentProps<"a">) => <a {...props} data-client-navigation />,
}));

const profile: Profile = { id: "admin", username: "admin", full_name: "Admin", role: "admin", is_active: true };
const workLinks = [
  ["New Complaints", "/admin/complaints"],
  ["Maintenance Jobs", "/admin/jobs"],
  ["Check-out Rooms", "/admin/checkouts"],
  ["Flex Fire Safety Inspection", "/flex-inspections"],
  ["Waste Collection", "/admin/waste-collection"],
];

it("uses direct same-tab links only for the five Work Management entries in both menus", () => {
  render(<AppShell profile={profile} title="New Complaints">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    const links = within(menu).getAllByRole("link", { hidden: true });
    const nativeLinks = links.filter(link => !link.hasAttribute("data-client-navigation"));
    expect(nativeLinks.map(link => [link.textContent, link.getAttribute("href")])).toEqual(workLinks);
    for (const link of nativeLinks) {
      expect(link).not.toHaveAttribute("target");
      expect(link).not.toHaveAttribute("download");
    }
    expect(nativeLinks[0]).toHaveAttribute("aria-current", "page");
    expect(links.find(link => link.textContent === "Material Requests")).toHaveAttribute("data-client-navigation");
  }
});

it("keeps Flex hidden in both Work Management menus for management viewers", () => {
  render(<AppShell profile={{ ...profile, role: "management_viewer" }} title="Dashboard">Page</AppShell>);
  const menus = screen.getAllByRole("navigation", { name: "Main navigation", hidden: true });
  expect(menus).toHaveLength(2);
  for (const menu of menus) {
    expect(menu.querySelector('a[href="/flex-inspections"]')).toBeNull();
    expect(menu.querySelectorAll(".work-management-link")).toHaveLength(4);
  }
});
