type Appointment = {
  appointment_date: string;
  appointment_time: string;
  status: string;
  remarks?: string | null;
  staff?: { full_name: string } | null;
};

export function MaintenanceAppointment({ appointment }: { appointment: Appointment | null }) {
  if (!appointment) return null;
  return <section className="panel detail-grid" style={{marginBottom:18}}>
    <div className="field-wide"><h3>Maintenance Appointment</h3></div>
    <div><span>Maintenance Date</span><strong>{appointment.appointment_date}</strong></div>
    <div><span>Maintenance Time</span><strong>{appointment.appointment_time.slice(0,5)}</strong></div>
    {appointment.staff && <div><span>Assigned Staff</span><strong>{appointment.staff.full_name}</strong></div>}
    <div><span>Appointment Status</span><strong>{appointment.status.replaceAll("_", " ")}</strong></div>
    {appointment.remarks && <div className="field-wide"><span>Remarks</span><p>{appointment.remarks}</p></div>}
  </section>;
}
