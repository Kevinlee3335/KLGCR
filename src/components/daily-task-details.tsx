"use client";

import { useEffect, useState } from "react";

type CompletionPhoto = { id: string; created_at: string; url: string | null };
type TimelineEntry = {
  id: number;
  action: string;
  comment: string | null;
  created_at: string;
  actor: { full_name: string } | null;
};
type Details = { view: "photos"; photos: CompletionPhoto[] } | { view: "timeline"; activity: TimelineEntry[] };
type DetailsView = Details["view"];
type LoadState = { status: "loading" | "failed" } | { status: "loaded"; details: Details };

const labels = { photos: "Completion photos", timeline: "Timeline" };
const malaysiaDate = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric",
});
const malaysiaTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: true,
});
const malaysiaDateTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
});

export function DailyTaskDetails({ taskId, hasPhotos }: { taskId: number; hasPhotos: boolean }) {
  return <>
    {hasPhotos && <TaskDisclosure taskId={taskId} view="photos"/>}
    <TaskDisclosure taskId={taskId} view="timeline"/>
  </>;
}

function TaskDisclosure({ taskId, view }: { taskId: number; view: DetailsView }) {
  const [open, setOpen] = useState(false);

  return <details className={view === "photos" ? "checkout-evidence" : undefined}
    onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{labels[view]}</summary>
    {open && <TaskDetailContent key={taskId} taskId={taskId} view={view}/>}
  </details>;
}

function TaskDetailContent({ taskId, view }: { taskId: number; view: DetailsView }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const label = labels[view].toLowerCase();

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/daily-tasks/${taskId}/details?view=${view}`, {
          signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("Unable to load daily task details.");
        const details: Details = await response.json();
        if (details.view !== view || !Array.isArray(details.view === "photos" ? details.photos : details.activity)) {
          throw new Error("Invalid daily task details.");
        }
        if (!controller.signal.aborted) setState({ status: "loaded", details });
      } catch {
        if (!controller.signal.aborted) setState({ status: "failed" });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt, taskId, view]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  if (state.status !== "loaded") {
    return state.status === "loading"
      ? <p className="subtle" role="status">Loading {label}…</p>
      : <><p className="error" role="alert">Unable to load {label}.</p>
        <button className="button secondary" type="button" onClick={retry}>Retry</button></>;
  }

  const { details } = state;
  if (details.view === "photos") {
    if (!details.photos.length) return <p className="subtle">No completion photos.</p>;
    return <>
      <div className="photo-grid">{details.photos.map((photo) => photo.url &&
        <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}>
          {/* Evidence URLs are short-lived and signed for the current session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" decoding="async" src={photo.url} alt="Daily task completion evidence"/>
          <span>{malaysiaDateTime.format(new Date(photo.created_at))}</span>
        </a>)}</div>
      {details.photos.some((photo) => !photo.url) && <>
        <p className="error" role="alert">Some completion photos could not be loaded.</p>
        <button className="button secondary" type="button" onClick={retry}>Retry</button>
      </>}
    </>;
  }

  if (!details.activity.length) return <p className="subtle">No progress update yet.</p>;
  return <ol className="activity-timeline">{details.activity.map((entry) => {
    const date = new Date(entry.created_at);
    return <li key={entry.id}>
      <div className="activity-marker"/>
      <time dateTime={entry.created_at}><strong>{malaysiaDate.format(date)}</strong><span>{malaysiaTime.format(date)}</span></time>
      <div className="activity-content">
        <strong>{entry.action}</strong>
        {entry.actor?.full_name && <span className="activity-actor">{entry.actor.full_name}</span>}
        {entry.comment && <p>{entry.comment}</p>}
      </div>
    </li>;
  })}</ol>;
}
