"use client";

import { logout } from "@/app/(dashboard)/actions";

export function LogoutForm() {
  return (
    <form action={logout} style={{ marginTop: 12 }}>
      <button className="button secondary full" type="submit">Sign out</button>
    </form>
  );
}
