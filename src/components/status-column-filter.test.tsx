import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusColumnFilter } from "./status-column-filter";

describe("StatusColumnFilter", () => {
  it("keeps sorting and status checkboxes inside the STATUS header menu", () => {
    const markup = renderToStaticMarkup(<StatusColumnFilter
      action="/admin/jobs"
      statusOptions={[{ value: "assigned", label: "Assigned" }, { value: "completed", label: "Completed" }]}
      selectedStatuses={["assigned", "completed"]}
      sortOptions={[{ value: "work_date:asc", label: "Work date · Ascending" }]}
      selectedSort="work_date:asc"
    />);

    expect(markup).toContain("status-column-menu");
    expect(markup).toContain('name="status_completed"');
    expect(markup).toContain('value="work_date:asc"');
  });
});
