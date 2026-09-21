import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dashboard } from "./dashboard";

describe("role dashboards", () => {
  it("shows live admin overview with navigable cards", () => {
    render(<Dashboard kind="admin" name="KLG Admin" data={{
      kpis: { tenantNotAvailable: 0, newComplaints: 2, todayJobs: 3, inProgress: 4, pendingMaterial: 1, underMonitoring: 2, completedToday: 5 },
      jobs: { assigned: 3, in_progress: 4, pending_material: 1, under_monitoring: 2, completed: 5 },
      complaints: [], tasks: [], tenantNoShows: [], inventory: { outOfStock: 1, nearReorder: 2 },
    }}/>)
    expect(screen.getByRole("link", { name: /New complaints/i })).toHaveAttribute("href", "/admin/complaints?status=new");
    expect(screen.getByText("Operations Command Centre")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows assigned blocks on staff mobile dashboard", () => {
    render(<Dashboard kind="staff" name="Abdullah" blocks="Block A & Block B" values={[1, 0, 0, 0]}/>);
    expect(screen.getByText("My tasks — Block A & Block B")).toBeInTheDocument();
    expect(screen.queryByText("New complaints")).not.toBeInTheDocument();
  });
});
