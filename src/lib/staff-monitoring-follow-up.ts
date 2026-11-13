import type { createClient } from "@/lib/supabase/server";
import { monitoringReviewCutoff } from "@/lib/monitoring-follow-up";

type Database = Awaited<ReturnType<typeof createClient>>;

export type AdminFollowUp = {
  id: number;
  note: string;
  new_status: string;
  created_at: string;
};

type FollowUpJob = {
  id: string;
  job_no: string;
  room_no: string;
  description: string;
  status: string;
  monitoring_note: string | null;
  monitoring_review_at: string | null;
  block: { code: string } | null;
  follow_ups: AdminFollowUp[];
};

type ReturnedJob = FollowUpJob & { cycle_changes: Pick<AdminFollowUp, "id">[] };

const adminFollowUpPattern = "Admin follow-up: %";
const followUpFields = "id,note,new_status,created_at";
const jobFields = "id,job_no,room_no,description,status,monitoring_note,monitoring_review_at,block:blocks!block_id(code)";

export async function getAdminFollowUps(db: Database, jobId: string) {
  const { data, error } = await db.from("job_status_history")
    .select(followUpFields)
    .eq("job_id", jobId)
    .eq("previous_status", "under_monitoring")
    .like("note", adminFollowUpPattern)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  return { followUps: (data ?? []) as AdminFollowUp[], error };
}

export async function getStaffMonitoringFollowUps(db: Database, staffId: string, today: string) {
  const [due, returned] = await Promise.all([
    db.from("maintenance_jobs")
      .select(`${jobFields},follow_ups:job_status_history(${followUpFields})`)
      .eq("assigned_to", staffId)
      .eq("status", "under_monitoring")
      .or(`monitoring_review_at.lt.${monitoringReviewCutoff(today)},monitoring_review_at.is.null`)
      .eq("follow_ups.previous_status", "under_monitoring")
      .like("follow_ups.note", adminFollowUpPattern)
      .order("id", { referencedTable: "follow_ups", ascending: false })
      .limit(1, { referencedTable: "follow_ups" })
      .order("monitoring_review_at", { ascending: true, nullsFirst: true }),
    db.from("maintenance_jobs")
      .select(`${jobFields},follow_ups:job_status_history!inner(${followUpFields}),cycle_changes:job_status_history(id)`)
      .eq("assigned_to", staffId)
      .in("status", ["in_progress", "pending_material"])
      .eq("follow_ups.previous_status", "under_monitoring")
      .eq("follow_ups.new_status", "in_progress")
      .like("follow_ups.note", adminFollowUpPattern)
      .order("id", { referencedTable: "follow_ups", ascending: false })
      .limit(1, { referencedTable: "follow_ups" })
      .in("cycle_changes.new_status", ["under_monitoring", "completed", "cancelled"])
      .order("id", { referencedTable: "cycle_changes", ascending: false })
      .limit(1, { referencedTable: "cycle_changes" }),
  ]);

  const returnedJobs = ((returned.data ?? []) as unknown as ReturnedJob[]).filter((job) => {
    const [followUp] = job.follow_ups;
    const [cycleChange] = job.cycle_changes;
    // A newer monitoring cycle or closure resolves the previous return-to-work reminder.
    return followUp && (!cycleChange || followUp.id > cycleChange.id);
  });
  returnedJobs.sort((a, b) => b.follow_ups[0].id - a.follow_ups[0].id);

  return {
    jobs: [...returnedJobs, ...((due.data ?? []) as unknown as FollowUpJob[])],
    error: due.error ?? returned.error,
  };
}
