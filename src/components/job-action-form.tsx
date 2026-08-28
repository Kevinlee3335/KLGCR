"use client";

import { startJob } from "@/app/(dashboard)/staff/jobs/actions";

export function StartJobForm({ jobId }: { jobId: string }) {
  return <form action={startJob.bind(null, jobId)} className="start-action"><button className="button" type="submit">Start Job</button></form>;
}
