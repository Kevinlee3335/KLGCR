"use client";

import Link, { useLinkStatus } from "next/link";
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
import styles from "./shell-navigation.module.css";

const materialRequestPaths = new Set(["/admin/material-requests", "/staff/material-request"]);

function supersedesNavigation(event: MouseEvent, destination: string) {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  return link instanceof HTMLAnchorElement && link.href !== destination && (!link.target || link.target === "_self") &&
    !link.hasAttribute("download") && event.button === 0 &&
    !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

type RecoveryOptions = { recoverStalledNavigation?: boolean };

function LinkFeedback({ replace, recoverStalledNavigation }: { replace?: boolean } & RecoveryOptions) {
  const { pending } = useLinkStatus();

  const indicator = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pending || document.visibilityState !== "visible") return;
    const anchor = indicator.current?.closest("a");
    if (!anchor || anchor.origin !== window.location.origin ||
      (!recoverStalledNavigation && !materialRequestPaths.has(anchor.pathname)) || anchor.pathname === window.location.pathname) return;

    const origin = window.location.href;
    const destination = anchor.href;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible" && window.location.href === origin) {
        if (replace) window.location.replace(destination);
        else window.location.assign(destination);
      }
    }, 3000);
    const cancel = () => window.clearTimeout(timer);
    const onClick = (event: MouseEvent) => { if (supersedesNavigation(event, destination)) cancel(); };

    // A later navigation or submission supersedes this particular click.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", cancel, true);
    document.addEventListener("visibilitychange", cancel);
    window.addEventListener("popstate", cancel);
    window.addEventListener("hashchange", cancel);
    window.addEventListener("pagehide", cancel);
    return () => {
      cancel();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", cancel, true);
      document.removeEventListener("visibilitychange", cancel);
      window.removeEventListener("popstate", cancel);
      window.removeEventListener("hashchange", cancel);
      window.removeEventListener("pagehide", cancel);
    };
  }, [pending, replace, recoverStalledNavigation]);

  return pending ? <span ref={indicator} className={styles.pending} role="status" aria-label="Loading page" /> : null;
}

export function ShellLink({ children, className, recoverStalledNavigation, ...props }: ComponentProps<typeof Link> & RecoveryOptions) {
  return (
    <Link {...props} className={className ? `${styles.link} ${className}` : styles.link}>
      {children}
      <LinkFeedback replace={props.replace} recoverStalledNavigation={recoverStalledNavigation} />
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
