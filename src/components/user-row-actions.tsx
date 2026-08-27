"use client";

import { sendReset, setUserActive } from "@/app/(dashboard)/admin/users/actions";

export function UserRowActions({ id, email, isActive }: { id: string; email?: string | null; isActive: boolean }) {
  return <div className="actions"><form action={setUserActive}><input type="hidden" name="id" value={id}/><input type="hidden" name="active" value={String(!isActive)}/><button className={`button ${isActive ? "danger" : "secondary"}`} type="submit">{isActive ? "Disable" : "Enable"}</button></form>{email && <form action={sendReset}><input type="hidden" name="email" value={email}/><button className="button secondary" type="submit">Reset</button></form>}</div>;
}
