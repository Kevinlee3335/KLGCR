"use client";

import { useActionState } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { login } from "@/app/(auth)/login/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, {});

  return (
    <form action={action} className="enterprise-login-form">
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
          <input type="checkbox" name="remember" />
          <span>Remember Me</span>
        </label>
        <button className="login-forgot" type="button">Forgot Password?</button>
      </div>
      {state.error && <p className="login-error" role="alert">{state.error}</p>}
      <button className="login-submit" disabled={pending}>
        <span>{pending ? "Signing in…" : "Sign in securely"}</span>
        {pending ? <LoaderCircle className="login-spinner" size={19} aria-hidden="true" /> : <ArrowRight size={19} aria-hidden="true" />}
      </button>
    </form>
  );
}
