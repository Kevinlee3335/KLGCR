import { saveComplianceRecord } from "@/app/(dashboard)/admin/cert-servicing/actions";

export type ComplianceRecord = {id:string;record_type:string;title:string;provider:string|null;reference_no:string|null;last_completed_date:string|null;next_due_date:string;status:string;frequency:string|null;contact_name:string|null;contact_phone:string|null;notes:string|null};

export function ComplianceRecordForm({record}:{record?:ComplianceRecord}){
  return <form action={saveComplianceRecord} className="form-grid" style={{marginTop:16}}>
    {record&&<input type="hidden" name="recordId" value={record.id}/>}
    <label className="field">Type<select name="recordType" defaultValue={record?.record_type||"servicing"}><option value="servicing">Servicing</option><option value="certificate_license">Certificate / License</option></select></label>
    <label className="field">Title<input name="title" required defaultValue={record?.title}/></label>
    <label className="field">Provider<input name="provider" defaultValue={record?.provider||""}/></label>
    <label className="field">Reference No.<input name="referenceNo" defaultValue={record?.reference_no||""}/></label>
    <label className="field">Last completed date<input name="lastCompletedDate" type="date" defaultValue={record?.last_completed_date||""}/></label>
    <label className="field">Next due date<input name="nextDueDate" type="date" required defaultValue={record?.next_due_date}/></label>
    <label className="field">Frequency<input name="frequency" defaultValue={record?.frequency||""} placeholder="Monthly / Yearly"/></label>
    <label className="field">Status<select name="status" defaultValue={record?.status||"active"}><option value="active">Active</option><option value="renewal_in_progress">Renewal in progress</option><option value="expired">Expired</option><option value="completed">Completed</option></select></label>
    <label className="field">Contact name<input name="contactName" defaultValue={record?.contact_name||""}/></label>
    <label className="field">Contact phone<input name="contactPhone" defaultValue={record?.contact_phone||""}/></label>
    <label className="field field-wide">Notes<textarea name="notes" rows={3} defaultValue={record?.notes||""}/></label>
    <button className="button">{record?"Save corrections":"Save record"}</button>
  </form>;
}
