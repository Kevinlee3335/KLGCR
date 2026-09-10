type ReporterInformationProps = {
  name?: string | null;
  phone?: string | null;
  availabilityDate?: string | null;
  availabilityTime?: string | null;
  roomAccessPermission?: string | null;
};

function formatAvailabilityDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day)));
  return `${String(day).padStart(2, "0")} ${monthName} ${year}`;
}

function formatAvailabilityTime(value: string) {
  return value.replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, (_, hour: string, minute: string) => {
    const numericHour = Number(hour);
    if (numericHour > 23) return `${hour}:${minute}`;
    return `${numericHour % 12 || 12}:${minute} ${numericHour < 12 ? "AM" : "PM"}`;
  });
}

export function ReporterInformation({ name, phone, availabilityDate, availabilityTime, roomAccessPermission }: ReporterInformationProps) {
  return <section className="panel detail-grid" style={{marginBottom:18}}>
    <div className="field-wide"><h3>Reporter Information</h3></div>
    {name && <div><span>Reporter Name</span><strong>{name}</strong></div>}
    {phone && <div><span>Phone</span><strong>{phone}</strong></div>}
    {availabilityDate && <div><span>Preferred Availability Date</span><strong>{formatAvailabilityDate(availabilityDate)}</strong></div>}
    {availabilityTime && <div><span>Preferred Availability Time</span><strong>{formatAvailabilityTime(availabilityTime)}</strong></div>}
    {roomAccessPermission && <div><span>Room Access Permission</span><strong>{roomAccessPermission.toUpperCase()}</strong></div>}
  </section>;
}
