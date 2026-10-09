"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { DailyTaskCompletionForm } from "@/components/daily-task-completion-form";

export function AdminDailyTaskControls({ taskId, title, status, date, category }: { taskId: number; title: string; status: string; date: string; category?: string }) {
  const [selected, setSelected] = useState(status);
  const [addPhotos, setAddPhotos] = useState(false);
  const fields = <><input type="hidden" name="taskId" value={taskId} /><input type="hidden" name="date" value={date} />{category && <input type="hidden" name="taskCategory" value={category} />}</>;
  const completing = selected === "completed";
  return <div className="task-control-panel">
    <div className="task-control-toolbar">
      <div className="task-status-field"><span>Status</span><div className="task-status-buttons" role="group" aria-label="Task status">{[["pending", "Pending"], ["accepted", "Accepted"], ["in_progress", "In Progress"], ["completed", "Completed"], ["kiv", "KIV"]].map(([value, label]) => <button key={value} type="button" className={`task-status-choice${selected === value ? " selected" : ""}`} aria-pressed={selected === value} onClick={() => { setSelected(value); setAddPhotos(false); }}>{label}</button>)}</div></div>
      {status === "completed" && completing && <button type="button" className="button secondary" onClick={() => setAddPhotos(!addPhotos)}>{addPhotos ? "Hide upload" : "Add Photos"}</button>}
      <form action="/admin/daily-tasks/action" method="post" onSubmit={(event) => { if (!window.confirm(`Delete “${title}”?`)) event.preventDefault(); }}>{fields}<input type="hidden" name="action" value="admin_task_delete" /><button className="button danger task-delete-button" aria-label={`Delete ${title}`} title="Delete task"><Trash2 size={18} /></button></form>
    </div>
    {!completing && <form action="/admin/daily-tasks/action" method="post" className="task-note-update">{fields}<input type="hidden" name="action" value="admin_task_status" /><input type="hidden" name="status" value={selected} /><input name="comment" maxLength={1000} placeholder="Add update note (optional)" aria-label="Update note" /><button className="button">Update</button></form>}
    {completing && (status !== "completed" || addPhotos) && <section className="task-completion-panel"><h4>{status === "completed" ? "Add completion photos" : "Complete Task"}</h4><DailyTaskCompletionForm taskId={taskId} admin supplemental={status === "completed"} /></section>}
  </div>;
}
