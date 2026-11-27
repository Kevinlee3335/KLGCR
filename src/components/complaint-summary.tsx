import { requireRole } from "@/lib/auth";
import { ComplaintSummaryDisclosure } from "./complaint-summary-disclosure";
import { createClient } from "@/lib/supabase/server";
import { dateRange, malaysiaDate, summarize, type Appointment, type Complaint, type Job } from "@/lib/complaint-summary";

type Block = { id: number; code: string };

async function readSummary(dates: ReturnType<typeof dateRange>, block?: string) {
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

  return { data, error };
}

export async function ComplaintSummary({ from, to, block, blocks, filters }: { from?: string; to?: string; block?: string; blocks: Block[]; filters: Record<string, string | undefined> }) {
  const dates = dateRange(from, to, malaysiaDate(new Date()));
  const initiallyOpen = Boolean(from || to);
  async function loadOnOpen() {
    "use server";
    await requireRole(["admin", "management_viewer"]);
    return readSummary(dates, block);
  }

  return <ComplaintSummaryDisclosure key={JSON.stringify([dates.from, dates.to, block, initiallyOpen])}
    initiallyOpen={initiallyOpen} initialResult={initiallyOpen ? await readSummary(dates, block) : null}
    loadOnOpen={loadOnOpen}>
    <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "end", marginBottom: 12 }}>
      {(["search", "status", "priority", "source", "date", "needAppointment"] as const).map(key => filters[key] && <input key={key} type="hidden" name={key} value={filters[key]} />)}
      <label>From<br /><input aria-label="Summary from" type="date" name="summaryFrom" defaultValue={dates.from} required /></label>
      <label>To<br /><input aria-label="Summary to" type="date" name="summaryTo" defaultValue={dates.to} required /></label>
      <label>Block<br /><select aria-label="Summary block" name="block" defaultValue={block || ""}><option value="">All blocks</option>{blocks.map(b => <option key={b.id} value={b.id}>Block {b.code}</option>)}</select></label>
      <button className="button" type="submit">View summary</button>
    </form>
  </ComplaintSummaryDisclosure>;
}

export type ComplaintSummaryResult = Awaited<ReturnType<typeof readSummary>>;
