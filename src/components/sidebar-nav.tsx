"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarNav({ items }: { items: [string, string][] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main navigation">
      {items.map(([label, href]) => {
        const active = href !== "#" && (pathname === href || (href !== "/admin" && href !== "/staff" && pathname.startsWith(href)));
        return (
          <Link key={label} href={href} className={active ? "active" : undefined} aria-current={active ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
