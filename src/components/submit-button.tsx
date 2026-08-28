"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({ children, pendingText, className = "button" }: { children: React.ReactNode; pendingText: string; className?: string }) {
  const { pending } = useFormStatus();
  return <button className={className} type="submit" disabled={pending} aria-disabled={pending}>{pending ? pendingText : children}</button>;
}
