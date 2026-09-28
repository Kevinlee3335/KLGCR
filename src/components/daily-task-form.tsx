"use client";
import { useState } from "react";

export function DailyTaskForm({date,staff}:{date:string;staff:{id:string;full_name:string}[]}) {
  const [frequency,setFrequency]=useState("once");
  return <form action="/admin/daily-tasks/action" method="post" className="form-grid">
    <input type="hidden" name="action" value="admin_task_create"/><input type="hidden" name="date" value={date}/>
    <label className="field">Task<input name="title" required maxLength={300}/></label>
    <label className="field">Assign to<select name="assignedTo" required><option value="">Choose employee</option>{staff.map(person=><option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
    <label className="field">Repeat<select name="frequency" value={frequency} onChange={event=>setFrequency(event.target.value)}><option value="once">Once</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label>
    {frequency==="weekly"&&<label className="field">Weekday<select name="dayNumber">{["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day,index)=><option key={day} value={index}>{day}</option>)}</select></label>}
    {frequency==="monthly"&&<label className="field">Day of month<input type="number" name="dayNumber" min={1} max={31} defaultValue={1} required/><small>For shorter months, use the last day.</small></label>}
    <label className="field">Notes<input name="notes" maxLength={1000}/></label>
    <button className="button">Add Task</button>
  </form>;
}
