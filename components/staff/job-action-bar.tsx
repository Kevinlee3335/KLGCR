"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import type { JobStatus } from "@/components/ui/status-badge"
import { STATUS_META } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"

/**
 * Sticky status-progression control for the mobile job detail screen.
 *
 * DESIGN PASS ONLY: updates local UI state so the interaction feels real in
 * the preview. Wire the selected status to a Supabase mutation (server action)
 * when implementing the real flow.
 */
const FLOW: JobStatus[] = ["assigned", "in_progress", "pending_material", "monitoring", "completed"]

export function JobActionBar({ status }: { status: JobStatus }) {
  const [current, setCurrent] = useState<JobStatus>(status)
  const [saving, setSaving] = useState<JobStatus | null>(null)

  function choose(next: JobStatus) {
    if (next === current) return
    setSaving(next)
    // Simulate a brief async save purely for preview feedback.
    setTimeout(() => {
      setCurrent(next)
      setSaving(null)
    }, 500)
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Update Status
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {FLOW.map((s) => {
          const active = s === current
          const isSaving = saving === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => choose(s)}
              aria-pressed={active}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background text-muted-foreground active:bg-muted",
              )}
            >
              {isSaving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <span className={cn("size-2 rounded-full", STATUS_META[s].dot)} aria-hidden="true" />
              )}
              {STATUS_META[s].label}
              {active && !isSaving ? <Check className="size-3.5 text-primary" aria-hidden="true" /> : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
