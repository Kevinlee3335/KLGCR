"use client";

import Link, { useLinkStatus } from "next/link";
import { useRef, type ComponentProps, type ReactNode } from "react";
import styles from "./shell-navigation.module.css";

function LinkFeedback() {
  const { pending } = useLinkStatus();

  return pending ? <span className={styles.pending} role="status" aria-label="Loading page" /> : null;
}

export function ShellLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={className ? `${styles.link} ${className}` : styles.link}>
      {children}
      <LinkFeedback />
    </Link>
  );
}

export function MobileNavigationDrawer({ children }: { children: ReactNode }) {
  const drawer = useRef<HTMLDetailsElement>(null);

  function closeDrawer() {
    if (!drawer.current?.open) return;
    drawer.current.open = false;
    drawer.current.querySelector("summary")?.focus();
  }

  return (
    <details
      ref={drawer}
      className="mobile-menu"
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          closeDrawer();
        }
      }}
    >
      <summary aria-label="Navigation menu"><i aria-hidden="true" /><i aria-hidden="true" /><i aria-hidden="true" /></summary>
      <button
        type="button"
        className={`mobile-menu-backdrop ${styles.backdrop}`}
        aria-label="Close navigation menu"
        tabIndex={-1}
        onClick={closeDrawer}
      />
      {children}
    </details>
  );
}
