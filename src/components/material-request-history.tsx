type Snapshot = { description?: string; item_code?: string; requested_qty?: number | string; unit?: string };
type Event = { id: string | number; action: string; old_values: Snapshot; new_values: Snapshot; reason: string; created_at: string; actor: { full_name: string } | null };
const describe = (value: Snapshot) => `${value.item_code || ""} · ${value.description || "Material"} · ${value.requested_qty ?? ""} ${value.unit || ""}`;

export function MaterialRequestHistory({ history }: { history: Event[] }) {
  if (!history.length) return null;
  const sorted = [...history].sort((a,b) => b.created_at.localeCompare(a.created_at));
  return <details className="material-request-history"><summary>Item history ({history.length})</summary><ol>{sorted.map(event => <li key={event.id}>
    <strong>{event.action === "edit" ? "Material / quantity changed" : event.action === "cancel" ? "Approval cancelled" : "Item rejected"}</strong>
    <p>{event.action === "edit" ? <>From: {describe(event.old_values)}<br/>To: {describe(event.new_values)}</> : describe(event.old_values)}</p>
    <p>Reason: {event.reason}</p><small>{event.actor?.full_name || "Administrator"} · {new Intl.DateTimeFormat("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</small>
  </li>)}</ol></details>;
}
