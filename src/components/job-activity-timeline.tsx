import { type ActivityEvent, formatMalaysiaActivity } from "@/lib/job-activity";
import Image from "next/image";

function ActivityPhotos({ event }: { event: ActivityEvent }) {
  return event.photos?.length ? <div className="photo-grid">{event.photos.map(photo => <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><Image src={photo.url} alt="Maintenance completion photo" width={240} height={180} unoptimized style={{objectFit:"cover"}} /></a>)}</div> : null;
}

export function JobActivityTimeline({ events, compact = false }: { events: ActivityEvent[]; compact?: boolean }) {
  return <section className={`panel activity-panel${compact ? " record-history" : ""}`} aria-labelledby="job-activity-heading">
    <div className="activity-heading"><div><p className="eyebrow">Complete history</p><h3 id="job-activity-heading">Job Activity Timeline</h3></div><span>Malaysia Time (MYT)</span></div>
    {events.length ? compact ? <div className="table-wrap"><table className="table record-history-table"><thead><tr><th>Date / Time (MYT)</th><th>Activity</th><th>Staff</th><th>Remarks / Evidence</th></tr></thead><tbody>{events.map(event => {
      const displayed = formatMalaysiaActivity(event.timestamp);
      return <tr key={event.id}><td><time dateTime={event.timestamp}><strong>{displayed.date}</strong><span>{displayed.time}</span></time></td><td><strong>{event.action}</strong></td><td>{event.actor || "—"}</td><td>{event.remarks && <p>{event.remarks}</p>}<ActivityPhotos event={event}/>{!event.remarks && !event.photos?.length ? "—" : null}</td></tr>;
    })}</tbody></table></div> : <ol className="activity-timeline">{events.map((event) => {
      const displayed = formatMalaysiaActivity(event.timestamp);
      return <li key={event.id}>
        <div className="activity-marker" aria-hidden="true" />
        <time dateTime={event.timestamp}><strong>{displayed.date}</strong><span>{displayed.time}</span></time>
        <div className="activity-content"><strong>{event.action}</strong>{event.actor && <span className="activity-actor">{event.actor}</span>}{event.remarks && <p>{event.remarks}</p>}<ActivityPhotos event={event}/></div>
      </li>;
    })}</ol> : <p className="subtle">No timestamped activity is available for this job.</p>}
  </section>;
}
