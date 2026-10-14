export type GroupableCalendarEvent = {
  id: string; title: string; notes: string | null; starts_at: string; ends_at: string | null;
  event_type: string; audience: string; assigned_to: string | null;
  created_by: string; subject_staff_id: string | null;
  staff: { full_name: string } | null;
};
// Only combine the display. Each recipient keeps the original event ID.
export function groupCalendarEvents<T extends GroupableCalendarEvent>(events: T[]) {
  const groups: { key: string; event: T; members: T[] }[] = [];
  const matching = new Map<string, typeof groups>();
  for (const event of events) {
    const signature=JSON.stringify([event.title,event.notes,event.starts_at,event.ends_at,event.event_type,event.audience,event.created_by,event.subject_staff_id]);
    const candidates=matching.get(signature) || [];
    let group=event.assigned_to ? candidates.find(candidate=>candidate.members.every(member=>member.assigned_to !== event.assigned_to)) : undefined;
    if (!group) {
      group={key:event.id,event,members:[]};
      candidates.push(group); matching.set(signature,candidates); groups.push(group);
    }
    group.members.push(event);
  }
  return groups;
}
export function calendarRecipients<T extends GroupableCalendarEvent>(members: T[]) {
  return members[0]?.audience === "all_staff" ? "All staff" : members.map(member=>member.staff?.full_name || "Selected staff").join(", ");
}
