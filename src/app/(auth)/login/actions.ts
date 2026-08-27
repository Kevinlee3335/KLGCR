"use server";

import { redirect } from "next/navigation";
import { classifyProfileAccess } from "@/lib/login-access";
import { createClient } from "@/lib/supabase/server";
import { roleHome } from "@/lib/types";

export type LoginState = { error?: string };

export async function login(_: LoginState, formData: FormData): Promise<LoginState> {
  const identifier = String(formData.get("identifier") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!identifier || !password) return { error: "Enter your username or email and password." };

  // Username resolution and password authentication intentionally share this
  // request-scoped client, so both always use the same public Supabase project.
  const supabase = await createClient();
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await supabase.rpc("login_email_for_username", { login_username: identifier });
    if (error || !data) return { error: "Invalid username/email or password." };
    email = data;
  }

  // Supabase Auth rejects banned users here before a profile lookup is made.
  const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !authData.user) return { error: "Invalid username/email or password." };

  // Admin RLS can read every profile, so an unfiltered .single() fails as soon
  // as more than one profile exists. Always select the authenticated user's row.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  const access = classifyProfileAccess(profile, profileError);
  if (access.status !== "active") {
    await supabase.auth.signOut();
    if (access.status === "disabled") {
      return { error: "This account is disabled. Contact an administrator." };
    }
    if (access.status === "missing") {
      return { error: "Your account profile is not configured. Contact an administrator." };
    }
    return { error: "Unable to verify account access. Please try again." };
  }

  redirect(roleHome(access.profile.role));
}
