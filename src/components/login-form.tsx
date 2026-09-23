"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { roleHome, type AppRole } from "@/lib/types";

type SyncResult = { ok: true; role: AppRole } | { ok: false; error: string };

async function syncSession(accessToken: string, refreshToken: string): Promise<SyncResult> {
  const response = await fetch("/api/auth/sync-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, refreshToken }),
  });
  return response.json() as Promise<SyncResult>;
}

export function LoginForm({ logoutRequested = false }: { logoutRequested?: boolean }) {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const restored = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function restoreSavedSignIn() {
      if (logoutRequested) {
        await supabase.auth.signOut();
        return;
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session || restored.current || cancelled) return;
      restored.current = true;
      setPending(true);

      try {
        const result = await syncSession(session.access_token, session.refresh_token);
        if (result.ok) {
          window.location.replace(roleHome(result.role));
          return;
        }
        await supabase.auth.signOut();
      } catch {
        // Keep the sign-in form available if the network is temporarily unavailable.
      } finally {
        if (!cancelled) setPending(false);
      }
    }

    void restoreSavedSignIn();
    return () => { cancelled = true; };
  }, [logoutRequested]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);
    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const supabase = createClient();

    try {
      let email = identifier;
      if (!identifier.includes("@")) {
        const { data, error: lookupError } = await supabase.rpc("login_email_for_username", { login_username: identifier });
        if (lookupError || !data) throw new Error("Invalid username/email or password.");
        email = data;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.session) throw new Error("Invalid username/email or password.");

      const result = await syncSession(data.session.access_token, data.session.refresh_token);
      if (!result.ok) {
        await supabase.auth.signOut();
        throw new Error(result.error);
      }
      window.location.assign(roleHome(result.role));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to sign in. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enterprise-login-form">
      <div className="login-field">
        <label htmlFor="identifier">Username</label>
        <div className="login-input-wrap">
          <UserRound size={18} aria-hidden="true" />
          <input
            id="identifier"
            name="identifier"
            autoComplete="username"
            required
            placeholder="Enter your username"
          />
        </div>
      </div>
      <div className="login-field">
        <label htmlFor="password">Password</label>
        <div className="login-input-wrap">
          <LockKeyhole size={18} aria-hidden="true" />
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="Enter your password"
          />
        </div>
      </div>
      <div className="login-form-options">
        <label className="login-remember">
          <input type="checkbox" name="remember" defaultChecked />
          <span>Remember Me</span>
        </label>
        <button className="login-forgot" type="button">Forgot Password?</button>
      </div>
      {error && <p className="login-error" role="alert">{error}</p>}
      <button className="login-submit" disabled={pending}>
        <span>{pending ? "Signing in…" : "Sign in securely"}</span>
        {pending ? <LoaderCircle className="login-spinner" size={19} aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
      </button>
    </form>
  );
}
