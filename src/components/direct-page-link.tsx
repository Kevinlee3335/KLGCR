import type { ComponentProps } from "react";

// Use a single document navigation for pages with first-visit work, including
// the billing dashboard and opening an email that will be marked as read.
export function DirectPageLink(props: ComponentProps<"a">) {
  return <a {...props}/>;
}
