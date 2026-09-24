import { createClient } from "@/lib/supabase/server";
import { dateRange, malaysiaDate, summarize, type Appointment, type Complaint, type Job } from "@/lib/complaint-summary";

type Block = { id: number; code: string };

export async function ComplaintSummary({ from, to, block, blocks, filters }: { from?: string; to?: string; block?: string; blocks: Block[]; filters: Record<string, string | undefined> }) {
  const dates = dateRange(from, to, malaysiaDate(new Date()));
  const db = await createClient();
  async function pages<T>(run: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
    const result: T[] = [];
    for (let start = 0; ; start += 500) {
      const { data, error } = await run(start, start + 499);
      if (error) throw Error(error.message);
      result.push(...(data ?? []));
      if (!data || data.length < 500) return result;
    }
  }
  let data: (ReturnType<typeof summarize> & { completedJobs: number; completedDuringPeriod: number; roomsCompletedDuringPeriod: number }) | null = null;
  let error: string | null = dates.error;
  if (!error) try {
    const complaints = await pages<Complaint>((start, end) => {
      let request = db.from("complaints").select("id,block_id,room_no,status").gte("submitted_at", dates.startUtc).lt("submitted_at", dates.endUtc).order("id").range(start, end);
      if (block) request = request.eq("block_id", block);
      return request;
    });
    const jobs: Job[] = [];
    for (let i = 0; i < complaints.length; i += 100) {
      const ids = complaints.slice(i, i + 100).map(c => c.id);
      jobs.push(...await pages<Job>((start, end) => db.from("maintenance_jobs").select("id,complaint_id,status").in("complaint_id", ids).order("id").range(start, end)));
    }
    const appointments: Appointment[] = [];
    for (let i = 0; i < jobs.length; i += 100) {
      const ids = jobs.slice(i, i + 100).map(j => j.id);
      appointments.push(...await pages<Appointment>((start, end) => db.from("appointments").select("job_id,status,created_at").in("job_id", ids).order("created_at", { ascending: false }).range(start, end)));
    }
    const completed = await pages<{ complaint_id: string; block_id: number; room_no: string }>((start, end) => {
      let request = db.from("maintenance_jobs").select("complaint_id,block_id,room_no").gte("completed_at", dates.startUtc).lt("completed_at", dates.endUtc).order("completed_at").range(start, end);
      if (block) request = request.eq("block_id", block);
      return request;
    });
    data = { ...summarize(complaints, jobs, appointments), completedJobs: completed.length, completedDuringPeriod: new Set(completed.map(j => j.complaint_id)).size, roomsCompletedDuringPeriod: new Set(completed.map(j => `${j.block_id}:${j.room_no.trim().toUpperCase()}`)).size };
  } catch (caught) { error = caught instanceof Error ? caught.message : "Unable to load summary."; }

  return <details className="panel complaint-summary" open={Boolean(from || to)}>
    <summary><strong>Report Summary</strong><span className="complaint-summary-toggle">View date summary <span aria-hidden="true">⌄</span></span></summary>
    <div className="complaint-summary-content">
    <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 12 }}>
      {(["search", "status", "priority", "source", "date", "needAppointment"] as const).map(key => filters[key] && <input key={key} type="hidden" name={key} value={filters[key]} />)}
      <label>From<br /><input aria-label="Summary from" type="date" name="summaryFrom" defaultValue={dates.from} required /></label>
      <label>To<br /><input aria-label="Summary to" type="date" name="summaryTo" defaultValue={dates.to} required /></label>
      <label>Block<br /><select aria-label="Summary block" name="block" defaultValue={block || ""}><option value="">All blocks</option>{blocks.map(b => <option key={b.id} value={b.id}>Block {b.code}</option>)}</select></label>
      <button className="button" type="submit">View summary</button>
    </form>
    {error ? <p className="error">Summary unavailable: {error}</p> : data && <>
      <div className="metrics compact">{[["New reports received", data.total], ["Rooms reported", data.rooms], ["Completed reports (current)", data.completed], ["Completed rooms (current)", data.completedRooms], ["In progress", data.inProgress], ["Pending material", data.pendingMaterial], ["Under monitoring", data.monitoring], ["Tenant not available", data.tenantUnavailable], ["Assigned / not started", data.assigned], ["Pending / not assigned", data.pending], ["Rejected", data.rejected]].map(([label, value]) => <article className="panel metric" key={String(label)}><span className="subtle">{label}</span><div className="value">{value}</div></article>)}</div>
      <p style={{ marginBottom: 0 }}><strong>Completion rate:</strong> {data.completionRate}% of reports received in this range are fully completed. <strong>Completed during this range:</strong> {data.completedJobs} jobs across {data.completedDuringPeriod} reports and {data.roomsCompletedDuringPeriod} rooms (including reports received earlier).</p>
    </>}
    </div>
  </details>;
}
