import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import type { OfficeItem, OfficeUsage } from "@/lib/office-inventory/model";
import { OfficeUsageForm } from "./office-usage-form";

type OfficeCatalog = { items: OfficeItem[]; error?: never } | { error: true; items?: never };
type OfficeUsageProps = {
  profile: Profile;
  page?: string;
  search?: string;
  base?: string;
  catalog?: OfficeCatalog | Promise<OfficeCatalog>;
};

const pageSize = 25;
const malaysiaDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short",
});

async function readOfficeCatalog(): Promise<OfficeCatalog> {
  const db = await createClient();
  const { data, error } = await db.from("inventory_items")
    .select("id,item_code,description,unit,balance_qty,quantity_unverified")
    .eq("inventory_group", "office").eq("is_active", true).order("item_code");
  return error ? { error: true } : { items: data ?? [] };
}

async function WithdrawalForm({ name, catalog }: { name: string; catalog?: OfficeUsageProps["catalog"] }) {
  const stock = await (catalog ?? readOfficeCatalog());
  if (stock.error) return <p className="error">Unable to load office stock. Please refresh.</p>;
  return <OfficeUsageForm items={stock.items} name={name} />;
}

export function OfficeUsageSection({ profile, page = "1", search = "", base = "/office-inventory", catalog }: OfficeUsageProps) {
  const pageNumber = /^[1-9]\d{0,5}$/.test(page) ? Number(page) : 1;
  const term = search.trim().slice(0, 100);
  return <>
    {profile.role !== "management_viewer" && <section className="panel">
      <div className="section-head compact-head"><div><h3>Take Office Supplies</h3><p className="subtle">Enter who took the supplies and the quantity. Stock updates when your entry is recorded.</p></div></div>
      <Suspense fallback={<p className="subtle" role="status">Loading office stock…</p>}>
        <WithdrawalForm name={profile.full_name} catalog={catalog} />
      </Suspense>
    </section>}
    <section className="panel inventory-history-card" id="office-usage-history">
      <div className="section-head compact-head"><div><h3>Office Supplies Usage History</h3><p className="subtle">{["admin", "management_viewer"].includes(profile.role) ? "All recorded withdrawals." : "Your recorded withdrawals."} Date and time are shown in Malaysia Time.</p></div></div>
      <form action={base.split("?")[0]} method="get" className="inventory-form">
        {base.includes("store=office") && <input type="hidden" name="store" value="office" />}
        <label className="span-2"><span>Search usage history</span><input name="usageQ" defaultValue={term} maxLength={100} placeholder="Name, item code or supplies" /></label>
        <div><button type="submit" className="button secondary-button">Search History</button>{term && <a className="button secondary-button" href={`${base}#office-usage-history`}>Clear</a>}</div>
      </form>
      <Suspense key={JSON.stringify([term, pageNumber])} fallback={<p className="subtle" role="status">Loading usage history…</p>}>
        <UsageHistory base={base} term={term} page={pageNumber} />
      </Suspense>
    </section>
  </>;
}

async function UsageHistory({ base, term, page }: { base: string; term: string; page: number }) {
  const db = await createClient();
  let query = db.from("office_inventory_usage")
    .select("id,item_code,description,unit,taken_by_name,recorded_by_name,qty,balance_before,balance_after,note,taken_at", { count: "exact" })
    .order("taken_at", { ascending: false }).order("id", { ascending: false });
  if (term) {
    const pattern = JSON.stringify(`%${term}%`);
    query = query.or(`item_code.ilike.${pattern},description.ilike.${pattern},taken_by_name.ilike.${pattern}`);
  }
  const { data, count, error } = await query.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return <p className="error">Unable to load usage history. Please refresh.</p>;
  const rows = (data ?? []) as OfficeUsage[];
  const total = count ?? 0;
  const href = (n: number) => `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams({ usagePage: String(n), usageQ: term })}#office-usage-history`;
  return <>
    {rows.length ? <div className="table-wrap"><table className="table inventory-table">
      <thead><tr><th>Date / Time</th><th>Taken by</th><th>Item</th><th>Quantity</th><th>Stock Before / After</th><th>Remarks</th><th>Recorded by</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>
        <td>{malaysiaDateTime.format(new Date(row.taken_at))}</td><td><strong>{row.taken_by_name}</strong></td>
        <td><strong>{row.item_code}</strong><small>{row.description}</small></td><td>{row.qty} {row.unit}</td>
        <td>{row.balance_before} → {row.balance_after} {row.unit}</td><td>{row.note || "—"}</td><td>{row.recorded_by_name}</td>
      </tr>)}</tbody>
    </table></div> : <p className="dashboard-empty">{term ? "No records match this search." : "No office supplies have been recorded yet."}</p>}
    <div className="section-head" style={{ marginTop: 12 }}>
      <small>{total} record{total === 1 ? "" : "s"} · Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</small>
      <div>{page > 1 && <a className="button secondary-button" href={href(page - 1)}>Previous</a>}{page * pageSize < total && <a className="button secondary-button" href={href(page + 1)}>Next</a>}</div>
    </div>
  </>;
}
