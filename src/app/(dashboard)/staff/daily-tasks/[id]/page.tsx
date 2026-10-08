import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DailyTaskCompletionForm } from "@/components/daily-task-completion-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Activity = { id: number; action: string; comment: string | null; created_at: string; actor: { full_name: string } | null };
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

export default async function DailyTaskDetails({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["maintenance_staff", "cleaner"]);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id)) notFound();
  const db = await createClient();
  const [{ data: task }, { data: photos }] = await Promise.all([
    db.from("admin_daily_tasks").select("id,title,notes,status,task_date,completed_at,activity:daily_task_activity(id,action,comment,created_at,actor:profiles!daily_task_activity_actor_id_fkey(full_name))").eq("id", id).eq("assigned_to", profile.id).maybeSingle(),
    db.from("daily_task_photos").select("id,storage_path,created_at").eq("task_id", id).order("created_at"),
  ]);
  if (!task) notFound();
  const signedPhotos = await Promise.all((photos || []).map(async (photo) => ({ ...photo, url: (await db.storage.from("checkout-evidence").createSignedUrl(photo.storage_path, 3600)).data?.signedUrl })));
  const activity = (task.activity || []) as unknown as Activity[];
  return <AppShell profile={profile} title="Daily Task Details"><Link className="text-link" href={`/staff/daily-tasks?date=${task.task_date}`}>← Back to daily tasks</Link><section className="panel daily-task-detail-hero"><div><p className="eyebrow">Due {task.task_date}</p><h2>{task.title}</h2><p>{task.notes || "No additional instructions."}</p></div><span className={`status-badge status-${task.status}`}>{task.status.replaceAll("_", " ")}</span></section>{task.status !== "completed" ? <section className="panel"><h3>Complete this task</h3><p className="subtle">Add the completion note and photo evidence, then mark it complete.</p><DailyTaskCompletionForm taskId={task.id}/></section> : <section className="panel"><h3>Completed</h3><p className="success">This task was completed {task.completed_at ? formatDateTime(task.completed_at) : ""}.</p><h4>Add completion photos</h4><DailyTaskCompletionForm taskId={task.id} supplemental /></section>}<section className="panel checkout-evidence"><h3>Photo evidence</h3><div className="photo-grid">{signedPhotos.map((photo) => photo.url && <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}><img src={photo.url} alt="Daily task completion evidence"/><span>{formatDateTime(photo.created_at)}</span></a>)}</div>{!signedPhotos.length && <p className="subtle">No completion photos yet.</p>}</section><section className="panel"><h3>History</h3>{activity.length ? <ol className="activity-timeline">{activity.map((entry) => <li key={entry.id}><div className="activity-marker"/><time><strong>{formatDateTime(entry.created_at)}</strong></time><div className="activity-content"><strong>{entry.action}</strong>{entry.actor?.full_name && <span className="activity-actor">{entry.actor.full_name}</span>}{entry.comment && <p>{entry.comment}</p>}</div></li>)}</ol> : <p className="subtle">No activity yet.</p>}</section></AppShell>;
}
