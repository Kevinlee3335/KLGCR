import { type ActivityEvent, formatMalaysiaActivity } from "@/lib/job-activity";

export function JobActivityTimeline({ events }: { events: ActivityEvent[] }) {
  return <section className="panel activity-panel" aria-labelledby="job-activity-heading">
    <div className="activity-heading"><div><p className="eyebrow">Complete history</p><h3 id="job-activity-heading">Job Activity Timeline</h3></div><span>Malaysia Time (MYT)</span></div>
    {events.length ? <ol className="activity-timeline">{events.map((event) => {
      const displayed = formatMalaysiaActivity(event.timestamp);
      return <li key={event.id}>
        <div className="activity-marker" aria-hidden="true" />
        <time dateTime={event.timestamp}><strong>{displayed.date}</strong><span>{displayed.time}</span></time>
        <div className="activity-content"><strong>{event.action}</strong>{event.actor && <span className="activity-actor">{event.actor}</span>}{event.remarks && <p>{event.remarks}</p>}</div>
      </li>;
    })}</ol> : <p className="subtle">No timestamped activity is available for this job.</p>}
  </section>;
}
