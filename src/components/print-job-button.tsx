"use client";

import { Printer } from "lucide-react";

export function PrintJobButton() {
  return <button className="job-drawer-action" type="button" onClick={() => window.print()}><Printer size={16}/> Print Job Sheet</button>;
}
