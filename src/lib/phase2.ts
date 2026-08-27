export const complaintStatuses = ["new","under_review","assigned","rejected","closed"] as const;
export const priorities = ["low","normal","high","urgent"] as const;
export const sources = ["google_form","manual","cleaning","flex","other"] as const;
export const jobStatuses = ["assigned","in_progress","pending_material","under_monitoring","completed","cancelled"] as const;
export const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
export const formatDate = (value: string) => new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export type ComplaintRow = {
  id:string; complaint_no:string; source:string; room_no:string; complainant_name:string|null; complainant_contact:string|null;
  category:string; description:string; priority:string; status:string; submitted_at:string; assigned_at:string|null;
  block:{id:number;code:string}|null; assignee:{id:string;full_name:string}|null;
};
export type JobRow = {
  id:string;job_no:string;room_no:string;category:string;description:string;priority:string;status:string;assigned_at:string;updated_at:string;
  started_at:string|null;completed_at:string|null;action_taken:string|null;monitoring_note:string|null;monitoring_started_at:string|null;monitoring_review_at:string|null;pending_material_note:string|null;block:{id:number;code:string}|null;assignee:{id:string;full_name:string}|null;complaint:{complaint_no:string}|null;
};
