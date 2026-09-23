"use client";

import { sendReset, setUserActive, updateUserRole } from "@/app/(dashboard)/admin/users/actions";

const roles = [
  ["admin", "Administrator"],
  ["maintenance_staff", "Maintenance Staff"],
  ["cleaner", "Cleaner / Housekeeping"],
  ["management_viewer", "Management Viewer"],
] as const;

export function UserRowActions({ id, email, isActive, role }: { id: string; email?: string | null; isActive: boolean; role: string }) {
  return <div className="actions">
    <form action={updateUserRole}>
      <input type="hidden" name="id" value={id}/>
      <select name="role" defaultValue={role} aria-label="User role">
        {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <button className="button secondary" type="submit">Save role</button>
    </form>
    <form action={setUserActive}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!isActive)}/><button className={`button ${isActive ? "danger" : "secondary"}`} type="submit">{isActive ? "Disable" : "Enable"}</button></form>
    {email && <form action={sendReset}><input type="hidden" name="email" value={email}/><button className="button secondary" type="submit">Reset</button></form>}
  </div>;
}
