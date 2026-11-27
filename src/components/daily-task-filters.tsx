import Link from "next/link";
import { Suspense } from "react";
import { taskFilterStatuses } from "@/lib/daily-task-filters";
type StaffOption = { id: string; full_name: string };
type StaffOptions = StaffOption[] | Promise<StaffOption[]>;

async function StaffSelect({ staff, selected }: { staff: StaffOptions; selected?: string }) {
  const options = await staff;
  return <select name="assignedTo" defaultValue={selected || ""}>
    <option value="">All staff</option>
    {options.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}
  </select>;
}

export function DailyTaskFilters({ filters, category, staff, sort }: { filters: Record<string, string | undefined>; category?: string; staff?: StaffOptions; sort?: string }) {
  const reset = category ? `/admin/daily-tasks?category=${category}` : staff ? "/admin/daily-tasks" : "/staff/daily-tasks";
  return <form className="daily-task-search-controls">
    {category && <input type="hidden" name="category" value={category} />}
    {sort && <input type="hidden" name="sort" value={sort} />}
    <label className="field"><span>Search</span><input type="search" name="q" maxLength={100} defaultValue={filters.q || ""} placeholder="Task name or notes" /></label>
    <label className="field"><span>Status</span><select name="status" defaultValue={filters.status || ""}><option value="">All statuses</option>{taskFilterStatuses.map(s => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</select></label>
    {staff && <label className="field"><span>Staff</span>
      <Suspense fallback={<>
        {filters.assignedTo && <input type="hidden" name="assignedTo" value={filters.assignedTo} />}
        <select disabled aria-label="Staff"><option>Loading staff…</option></select>
      </>}>
        <StaffSelect staff={staff} selected={filters.assignedTo} />
      </Suspense>
    </label>}
    <label className="field"><span>Work date</span><input type="date" name="date" defaultValue={filters.date || ""} /></label>
    <label className="field"><span>From</span><input type="date" name="from" defaultValue={filters.from || ""} /></label>
    <label className="field"><span>To</span><input type="date" name="to" defaultValue={filters.to || ""} /></label>
    <button className="button" type="submit">Search / Filter</button><Link className="button secondary" href={reset}>Clear</Link>
  </form>;
}
