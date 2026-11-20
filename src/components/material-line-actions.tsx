import { MatchMaterialItem } from "./match-material-item";
import type { MaterialLine } from "@/lib/material-request-state";

type Line = MaterialLine & {
  id: string;
  inventory_item_id: string | null;
  other_item_name?: string | null;
  item: { description: string; balance_qty: number | string; unit?: string | null } | null;
};

export function MaterialLineActions({ requestId, row }: { requestId: string; row: Line }) {
  if ((row.line_status && row.line_status !== "active") || (Number(row.issued_qty) > 0 && Number(row.issued_qty) >= Number(row.approved_qty))) return null;
  const approved = Number(row.approved_qty) > 0;
  const materialName = row.item?.description || row.other_item_name || "Material";
  return <div className="material-line-actions">
    {!approved ? <form action="/admin/material-requests/action" method="post">
      <input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="requestItemId" value={row.id}/>
      <input type="hidden" name="action" value="approve_item"/>
      <button className="button" disabled={!row.item || Number(row.item.balance_qty) < Number(row.requested_qty)}>Approve</button>
      {(!row.item || Number(row.item.balance_qty) < Number(row.requested_qty)) && <small className="subtle">{row.item ? "Awaiting stock" : "Match to inventory first"}</small>}
    </form> : <form action="/admin/material-requests/action" method="post">
      <input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="requestItemId" value={row.id}/>
      <input type="hidden" name="action" value="issue_item"/><button className="button secondary">Issue Item</button>
    </form>}
    {Number(row.issued_qty) === 0 && <><MatchMaterialItem requestId={requestId} itemId={row.id} materialName={materialName}
      edit={{ inventoryItemId: row.inventory_item_id, requestedQty: row.requested_qty, approvedQty: row.approved_qty }}/>
    <details className="material-line-decision">
      <summary>{approved ? "Cancel Approval" : "Reject Item"}</summary>
      <form action="/admin/material-requests/action" method="post">
        <input type="hidden" name="requestId" value={requestId}/><input type="hidden" name="requestItemId" value={row.id}/>
        <input type="hidden" name="action" value={approved ? "cancel_item" : "reject_item"}/>
        <input type="hidden" name="expectedInventoryItemId" value={row.inventory_item_id || ""}/>
        <input type="hidden" name="expectedRequestedQty" value={row.requested_qty}/>
        <input type="hidden" name="expectedApprovedQty" value={row.approved_qty ?? ""}/>
        <p>{approved ? "Cancel this unissued item. Stock will stay unchanged." : "Reject only this item. Other materials stay unchanged."}</p>
        <label>Reason<textarea name="reason" rows={2} maxLength={1000} required placeholder={approved ? "e.g. No longer needed" : "e.g. Wrong size requested"}/></label>
        <button className="button secondary">{approved ? "Confirm Cancellation" : "Confirm Rejection"}</button>
      </form>
    </details></>}
  </div>;
}
