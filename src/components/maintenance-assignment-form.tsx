"use client";

import { useActionState } from "react";
import { saveMaintenanceAssignments, type MaintenanceAssignmentState } from "@/app/(dashboard)/admin/settings/actions";
import { maintenanceBlockCodes } from "@/lib/maintenance-assignments";

type Staff = { id: string; full_name: string; blocks: string[] };

export function MaintenanceAssignmentForm({ staff }: { staff: Staff[] }) {
  const [state, action, pending] = useActionState<MaintenanceAssignmentState, FormData>(saveMaintenanceAssignments, {});

  return <form action={action} className="maintenance-settings-form">
    {!staff.length ? <div className="empty"><strong>No active maintenance staff found.</strong></div> : staff.map((member) =>
      <fieldset className="maintenance-staff-card" key={member.id}>
        <legend>{member.full_name}</legend>
        <input type="hidden" name="staffIds" value={member.id}/>
        <div className="maintenance-block-options">
          {maintenanceBlockCodes.map((code) => <label key={code}>
            <input type="checkbox" name={`blocks:${member.id}`} value={code} defaultChecked={member.blocks.includes(code)}/>
            <span>Block {code}</span>
          </label>)}
        </div>
      </fieldset>)}
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.ok && <p className="success" role="status">{state.ok}</p>}
    {staff.length > 0 && <button className="button" disabled={pending}>{pending ? "Saving…" : "Save assignment settings"}</button>}
  </form>;
}
