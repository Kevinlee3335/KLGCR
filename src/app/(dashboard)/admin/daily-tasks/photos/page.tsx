import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Task = { id: number; title: string; task_date: string; status: string; assignee: { full_name: string } | null };
type Photo = { id: string; task_id: number; storage_path: string; created_at: string; url?: string };

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export default async function DailyTaskPhotosPage() {
  const profile = await requireRole(["admin", "management_viewer"]);
  const db = await createClient();
  const { data: rawPhotos, error } = await db.from("daily_task_photos").select("id,task_id,storage_path,created_at").order("created_at", { ascending: false }).limit(120);
  const photos = (rawPhotos || []) as Photo[];
  const taskIds = Array.from(new Set(photos.map((photo) => photo.task_id)));
  const { data: rawTasks } = taskIds.length
    ? await db.from("admin_daily_tasks").select("id,title,task_date,status,assignee:profiles!assigned_to(full_name)").in("id", taskIds)
    : { data: [] as Task[] };
  const tasks = new Map<number, Task>((rawTasks || []).map((task): [number, Task] => [task.id, task as Task]));
  const signedPhotos = await Promise.all(photos.map(async (photo) => ({ ...photo, url: (await db.storage.from("checkout-evidence").createSignedUrl(photo.storage_path, 3600)).data?.signedUrl })));
  const grouped = new Map<number, Photo[]>();
  for (const photo of signedPhotos) grouped.set(photo.task_id, [...(grouped.get(photo.task_id) || []), photo]);

  return <AppShell profile={profile} title="Completion Photos"><div className="section-head"><div><p className="eyebrow">Daily Tasks</p><h2>Completion Photos</h2><p className="subtle">View photo evidence for completed Daily Tasks without opening the Calendar.</p></div><Link className="button secondary" href="/admin/daily-tasks">Back to Daily Tasks</Link></div>{error && <p className="error">{error.message}</p>}{!grouped.size ? <section className="panel empty"><strong>No Daily Task photos yet.</strong><span>Completed tasks with photos will appear here.</span></section> : <div className="daily-task-list">{Array.from(grouped.entries()).map(([taskId, taskPhotos]) => { const task = tasks.get(taskId); return <section className="panel daily-task-card" key={taskId}><div className="record-head"><div><h3>{task?.title || "Daily Task"}</h3><p>{task?.assignee?.full_name || "Assigned employee"} · Due {task?.task_date || "–"}</p></div><span className={`status-badge status-${task?.status || "completed"}`}>{(task?.status || "completed").replaceAll("_", " ")}</span></div><div className="photo-grid">{taskPhotos.map((photo) => photo.url && <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}><img src={photo.url} alt="Daily task completion evidence"/><span>{formatDateTime(photo.created_at)}</span></a>)}</div></section>; })}</div>}</AppShell>;
}
