"use client";

import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmation = String(formData.get("confirmation") || "");

    if (password.length < 8) {
      setError("New password must have at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("New password and confirmation do not match.");
      return;
    }

    setPending(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    form.reset();
    setMessage("Password updated successfully. Use your new password the next time you sign in.");
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <div>
          <span className="eyebrow">KLG Campus Residence</span>
          <h1>Account</h1>
          <p>Keep your company account secure.</p>
        </div>
      </section>
      <section className="login-form-wrap">
        <form className="panel login-panel" onSubmit={changePassword}>
          <p className="eyebrow">Account security</p>
          <h2>Change Password</h2>
          <p className="subtle">Enter a new password for your account.</p>
          <label className="field">New Password
            <input name="password" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <label className="field">Confirm New Password
            <input name="confirmation" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success" role="status">{message}</p>}
          <button className="button full" disabled={pending}>{pending ? "Updating…" : "Update Password"}</button>
        </form>
      </section>
    </main>
  );
}
