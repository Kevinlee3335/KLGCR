import Link from "next/link";
import { taskFilterStatuses } from "@/lib/daily-task-filters";
export function DailyTaskFilters({ filters, category, staff, sort }: { filters: Record<string, string | undefined>; category?: string; staff?: { id: string; full_name: string }[]; sort?: string }) {
  const reset = category ? `/admin/daily-tasks?category=${category}` : staff ? "/admin/daily-tasks" : "/staff/daily-tasks";
  return <form className="daily-task-search-controls">
    {category && <input type="hidden" name="category" value={category} />}
    {sort && <input type="hidden" name="sort" value={sort} />}
    <label className="field"><span>Search</span><input type="search" name="q" maxLength={100} defaultValue={filters.q || ""} placeholder="Task name or notes" /></label>
    <label className="field"><span>Status</span><select name="status" defaultValue={filters.status || ""}><option value="">All statuses</option>{taskFilterStatuses.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></label>
    {staff && <label className="field"><span>Staff</span><select name="assignedTo" defaultValue={filters.assignedTo || ""}><option value="">All staff</option>{staff.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>}
    <label className="field"><span>Work date</span><input type="date" name="date" defaultValue={filters.date || ""} /></label>
    <label className="field"><span>From</span><input type="date" name="from" defaultValue={filters.from || ""} /></label>
    <label className="field"><span>To</span><input type="date" name="to" defaultValue={filters.to || ""} /></label>
    <button className="button" type="submit">Search / Filter</button><Link className="button secondary" href={reset}>Clear / All Records</Link>
  </form>;
}
