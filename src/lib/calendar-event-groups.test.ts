import { expect, it } from "vitest";
import { calendarRecipients, groupCalendarEvents } from "./calendar-event-groups";
const base={title:"Operation Meeting",notes:"Office",starts_at:"2026-10-16T08:30:00+00:00",ends_at:"2026-10-16T15:59:59+00:00",event_type:"meeting",audience:"individual",created_by:"admin",subject_staff_id:null};
const rows=(count:number)=>Array.from({length:count},(_,index)=>({...base,id:`event-${index}`,assigned_to:`staff-${index}`,staff:{full_name:`Employee ${index+1}`}}));
it.each([["SPKA",5],["Meeting",10],["Annual leave",7]])("displays %s once and keeps all %i recipients",(title,count)=>{
  const events=rows(count).map(event=>({...event,title})); const original=JSON.stringify(events);
  const groups=groupCalendarEvents(events);
  expect(groups).toHaveLength(1);expect(groups[0].members).toEqual(events);
  expect(JSON.stringify(events)).toBe(original);
  expect(calendarRecipients(groups[0].members).split(", ")).toHaveLength(count);
});
it.each([{title:"Other meeting"},{notes:"Other room"},{starts_at:"2026-10-17T08:30:00Z"},{ends_at:"2026-10-18T08:30:00Z"},{event_type:"work"},{created_by:"other-admin"},{subject_staff_id:"another-person"},{audience:"all_staff"}])("separates different event details (%j)",(change)=>{
  const events=rows(2);expect(groupCalendarEvents([events[0],{...events[1],...change}])).toHaveLength(2);
});
it("does not collapse distinct events for the same recipient or All staff",()=>{
  const events=rows(2);
  expect(groupCalendarEvents([events[0],{...events[1],assigned_to:events[0].assigned_to}])).toHaveLength(2);
  const all=events.map(event=>({...event,audience:"all_staff",assigned_to:null}));
  expect(groupCalendarEvents(all)).toHaveLength(2);expect(calendarRecipients(all)).toBe("All staff");
});
it("retains original event IDs for notifications and per-employee deletion",()=>{
  expect(groupCalendarEvents(rows(3))[0].members.map(member=>member.id)).toEqual(["event-0","event-1","event-2"]);
});
