import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireRole } from "@/lib/auth";
import { titleCase } from "@/lib/phase2";
import { createClient } from "@/lib/supabase/server";

type AppointmentRow = {
  id: string;
  job_id: string | null;
  appointment_date: string;
  appointment_time: string;
  status: string;
  remarks: string | null;
  job: { job_no: string } | null;
  complaint: {
    complaint_no: string;
    room_no: string;
    complainant_name: string | null;
    complainant_contact: string | null;
    reporter_name: string | null;
    reporter_phone: string | null;
    room_access_permission: string | null;
    block: { code: string } | null;
  } | null;
  staff: { full_name: string } | null;
};

export default async function StaffAppointments() {
  const profile = await requireRole(["maintenance_staff"]);
  const supabase = await createClient();
  // RLS restricts this result to appointments assigned to the signed-in staff
  // member and complaints in their permitted blocks.
  const { data, error } = await supabase.from("appointments")
    .select("id,job_id,appointment_date,appointment_time,status,remarks,job:maintenance_jobs!appointments_job_id_fkey(job_no),complaint:complaints!appointment_complaint_id_fkey(complaint_no,room_no,complainant_name,complainant_contact,reporter_name,reporter_phone,room_access_permission,block:blocks!complaints_block_id_fkey(code)),staff:profiles!appointments_assigned_staff_fkey(full_name)")
    .order("appointment_date", { ascending: false })
    .order("appointment_time", { ascending: false });
  const appointments = (data || []) as unknown as AppointmentRow[];

  return <AppShell profile={profile} title="Appointments"><div className="section-head"><div><h2>Maintenance Appointments</h2><p className="subtle">Scheduled visits assigned to you.</p></div></div><section className="panel list-panel">{error ? <p className="error">{error.message}</p> : !appointments.length ? <p className="subtle">No appointments assigned.</p> : <div className="table-wrap"><table className="table"><thead><tr><th>Job / Complaint</th><th>Block</th><th>Room</th><th>Maintenance Date</th><th>Maintenance Time</th><th>Reporter</th><th>Phone Number</th><th>Room Access Permission</th><th>Assigned Staff</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id}><td>{appointment.job_id ? <><strong>{appointment.job?.job_no || "Job"}</strong><small> · {appointment.complaint?.complaint_no || "No complaint reference"}</small><br/><Link className="text-link" href={`/staff/jobs/${appointment.job_id}`}>View Job</Link></> : appointment.complaint?.complaint_no || "—"}</td><td>{appointment.complaint?.block?.code || "—"}</td><td>{appointment.complaint?.room_no || "—"}</td><td>{appointment.appointment_date}</td><td>{appointment.appointment_time.slice(0, 5)}</td><td>{appointment.complaint?.reporter_name || appointment.complaint?.complainant_name || "Not provided"}</td><td>{appointment.complaint?.reporter_phone || appointment.complaint?.complainant_contact || "Not provided"}</td><td>{appointment.complaint?.room_access_permission ? titleCase(appointment.complaint.room_access_permission) : "Not provided"}</td><td>{appointment.staff?.full_name || profile.full_name}</td><td><span className={`status-badge status-${appointment.status}`}>{titleCase(appointment.status)}</span></td><td>{appointment.remarks || "—"}</td></tr>)}</tbody></table></div>}</section></AppShell>;
}
