"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteUser, sendReset, setUserActive, setUserPassword, updateUserRole } from "@/app/(dashboard)/admin/users/actions";

const roles = [
  ["admin", "Administrator"],
  ["maintenance_staff", "Maintenance Staff"],
  ["cleaner", "Cleaner / Housekeeping"],
  ["management_viewer", "Management Viewer"],
] as const;

export function UserRowActions({ id, email, isActive, role, fullName }: { id: string; email?: string | null; isActive: boolean; role: string; fullName: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string>();

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await setUserPassword(new FormData(event.currentTarget));
    setMessage(result.error || result.ok);
    if (result.ok) event.currentTarget.reset();
  }

  async function removeUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(`Delete ${fullName}? This removes the user from the system and stops login access.`)) return;
    const result = await deleteUser(new FormData(event.currentTarget));
    setMessage(result.error || result.ok);
    if (result.ok) router.refresh();
  }

  return <details className="user-row-actions">
    <summary>Manage</summary>
    <div className="user-row-actions-panel">
      <form action={updateUserRole}>
        <input type="hidden" name="id" value={id}/>
        <label>Role<select name="role" defaultValue={role} aria-label="User role">
          {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button className="button secondary" type="submit">Save role</button>
      </form>
      <form action={setUserActive}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!isActive)}/><button className={`button ${isActive ? "danger" : "secondary"}`} type="submit">{isActive ? "Disable user" : "Enable user"}</button></form>
      <form onSubmit={updatePassword}>
        <input type="hidden" name="id" value={id}/>
        <label>New password<input name="password" type="password" minLength={10} autoComplete="new-password" required/></label>
        <button className="button secondary" type="submit">Update password</button>
      </form>
      {email && <form action={sendReset}><input type="hidden" name="email" value={email}/><button className="button secondary" type="submit">Send reset email</button></form>}
      <form onSubmit={removeUser}>
        <input type="hidden" name="id" value={id}/>
        <button className="button danger" type="submit">Delete user</button>
      </form>
      {message && <p className="user-row-action-message" role="status">{message}</p>}
    </div>
  </details>;
}
