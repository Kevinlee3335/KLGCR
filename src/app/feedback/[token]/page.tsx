import { notFound } from "next/navigation";
import { submitRating } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function FeedbackPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ submitted?: string; error?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const admin = createAdminClient();
  const { data: feedback } = await admin.from("maintenance_job_feedback")
    .select("rating,submitted_at,job:maintenance_jobs!maintenance_job_feedback_job_id_fkey(job_no,room_no,block:blocks!maintenance_jobs_block_id_fkey(code))")
    .eq("token", token).maybeSingle();
  if (!feedback) notFound();
  const job = Array.isArray(feedback.job) ? feedback.job[0] : feedback.job;
  const block = Array.isArray(job?.block) ? job.block[0] : job?.block;
  const submitted = query.submitted === "1" || Boolean(feedback.submitted_at);
  return <main className="feedback-page"><section className="feedback-card"><p className="eyebrow">KLG CAMPUS RESIDENCE</p><h1>{submitted ? "Thank you for your feedback" : "How was our maintenance service?"}</h1><p>Job {job?.job_no || ""} · Block {block?.code || ""} · Room {job?.room_no || ""}</p>{submitted ? <p className="success">Your {feedback.rating}-star rating has been recorded.</p> : <div className="rating-options">{[1,2,3,4,5].map((rating) => <form action={submitRating.bind(null, token, rating)} key={rating}><button type="submit" aria-label={`Rate ${rating} stars`}><span aria-hidden="true">★</span><strong>{rating}</strong></button></form>)}</div>}{query.error && <p className="error">Unable to save your rating. Please try again.</p>}</section></main>;
}
