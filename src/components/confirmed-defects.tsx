"use client";
import { useState } from "react";
import { addComplaintDefect } from "@/app/(dashboard)/admin/complaints/actions";
import { defectCatalog } from "@/lib/defect-catalog";

type Defect={id:string;item_group:string;item_name:string;issue_type:string;other_issue:string|null;exact_location:string|null;admin_confirmed_issue:string|null;maintenance_instruction:string|null;status:string};
export function ConfirmedDefects({complaintId,defects}:{complaintId:string;defects:Defect[]}) {
 const [selected,setSelected]=useState(defectCatalog[0]); const [issue,setIssue]=useState(selected.issues[0]);
 const change=(value:string)=>{const next=defectCatalog.find(x=>`${x.group}|${x.item}`===value)||defectCatalog[0];setSelected(next);setIssue(next.issues[0]);};
 return <section className="panel assignment-panel"><h3>Admin Confirmed Defects</h3><p className="subtle">Keep the student&apos;s original report above. Add the actual work items that Maintenance must handle.</p>
 <div className="defect-list">{defects.map(d=><div key={d.id}><span className={`status-badge status-${d.status}`}>{d.status.replaceAll("_"," ")}</span><strong>{d.item_name} — {d.issue_type==="Other"?d.other_issue:d.issue_type}</strong>{d.exact_location&&<small>Location: {d.exact_location}</small>}{d.admin_confirmed_issue&&<small>Confirmed: {d.admin_confirmed_issue}</small>}{d.maintenance_instruction&&<small>Instruction: {d.maintenance_instruction}</small>}</div>)}</div>
 <form action={addComplaintDefect.bind(null,complaintId)} className="form-grid operational-form">
 <label className="field"><span>Item *</span><select name="item" value={`${selected.group}|${selected.item}`} onChange={e=>change(e.target.value)}>{defectCatalog.map(x=><option key={`${x.group}|${x.item}`} value={`${x.group}|${x.item}`}>{x.group} · {x.item}</option>)}</select></label>
 <label className="field"><span>Issue *</span><select name="issue" value={issue} onChange={e=>setIssue(e.target.value)}>{selected.issues.map(x=><option key={x}>{x}</option>)}</select></label>
 {issue==="Other"&&<label className="field field-wide"><span>Other / Specify issue *</span><input name="otherIssue" required placeholder="Describe the issue"/></label>}
 <label className="field"><span>Exact Location / Detailed Location</span><input name="exactLocation" placeholder="e.g. Near window / above study table"/></label>
 <label className="field field-wide"><span>Admin Note / Instruction to Maintenance <em className="subtle">(Optional)</em></span><textarea name="instruction" rows={3} placeholder="e.g. Door closer arm is loose. Tighten and test the door closing."/></label>
 <div className="field-wide"><button className="button">Add confirmed defect</button></div></form></section>;
}