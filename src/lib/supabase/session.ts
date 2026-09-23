// Keep the Supabase refresh token in the device for as long as browsers allow.
// Supabase still rotates tokens and can end a session after a password change or sign-out.
export const authCookieOptions = {
  maxAge: 400 * 24 * 60 * 60,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
