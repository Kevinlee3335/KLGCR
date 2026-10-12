import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/(dashboard)/admin/settings/actions", () => ({ savePhoneNotificationPreferences: vi.fn() }));
import { PhoneNotificationSettings } from "./phone-notification-settings";
const members = [{id:"a",full_name:"Abdullah",role:"maintenance_staff"},{id:"f",full_name:"Faiz",role:"maintenance_staff"}];
describe("employee notification controls", () => {
  it("keeps each employee's controls independent and restores their saved preferences on selection", () => {
    render(<PhoneNotificationSettings members={members} preferences={[{user_id:"a",enabled:true,events:{job_assigned:false}}]}/>);
    expect(screen.getByRole("switch", {name:"Maintenance job assigned / transferred"})).not.toBeChecked();
    fireEvent.change(screen.getByRole("combobox"), {target:{value:"f"}});
    expect(screen.getByRole("switch", {name:"Maintenance job assigned / transferred"})).toBeChecked();
    fireEvent.click(screen.getByRole("button", {name:"Disable all types"}));
    expect(screen.getAllByRole("switch").every(input => !(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), {target:{value:"a"}});
    expect(screen.getByRole("switch", {name:"Maintenance job assigned / transferred"})).not.toBeChecked();
    expect(screen.getByRole("switch", {name:"Inventory sync failed"})).toBeChecked();
  });
});
