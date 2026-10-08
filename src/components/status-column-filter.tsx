import { ListFilter } from "lucide-react";

type Option = { value: string; label: string };
export type PreservedValue = { name: string; value?: string | null };

export function StatusColumnFilter({
  action,
  statusOptions,
  selectedStatuses,
  sortOptions,
  selectedSort,
  preserved = [],
}: {
  action: string;
  statusOptions: Option[];
  selectedStatuses: string[];
  sortOptions: Option[];
  selectedSort: string;
  preserved?: PreservedValue[];
}) {
  return <span className="status-column-filter">
    <span>Status</span>
    <details className="status-column-menu">
      <summary aria-label="Filter and sort status"><ListFilter size={14} strokeWidth={2.4} /></summary>
      <form action={action} className="status-column-menu-panel">
        {preserved.filter((item) => item.value).map((item) => <input key={item.name} type="hidden" name={item.name} value={item.value!} />)}
        <fieldset>
          <legend>Sort</legend>
          {sortOptions.map((option) => <label key={option.value}><input type="radio" name="sort" value={option.value} defaultChecked={option.value === selectedSort} />{option.label}</label>)}
        </fieldset>
        <fieldset>
          <legend>Filter by status</legend>
          {statusOptions.map((option) => <label key={option.value}><input type="checkbox" name={`status_${option.value}`} value={option.value} defaultChecked={selectedStatuses.includes(option.value)} />{option.label}</label>)}
        </fieldset>
        <button className="button button-compact" type="submit">Apply</button>
      </form>
    </details>
  </span>;
}

export function ColumnFilter({ label, action, name, options, selectedValue, preserved = [] }: { label: string; action: string; name: string; options: Option[]; selectedValue?: string; preserved?: PreservedValue[] }) {
  return <span className="status-column-filter"><span>{label}</span><details className="status-column-menu"><summary aria-label={`Filter ${label}`}><ListFilter size={14} strokeWidth={2.4} /></summary><form action={action} className="status-column-menu-panel">{preserved.filter((item) => item.value).map((item) => <input key={item.name} type="hidden" name={item.name} value={item.value!} />)}<fieldset><legend>Filter by {label}</legend><label><input type="radio" name={name} value="" defaultChecked={!selectedValue} />All</label>{options.map((option) => <label key={option.value}><input type="radio" name={name} value={option.value} defaultChecked={option.value === selectedValue} />{option.label}</label>)}</fieldset><button className="button button-compact" type="submit">Apply</button></form></details></span>;
}

export function DateColumnFilter({ action, selectedDate, selectedSort, preserved = [] }: { action: string; selectedDate?: string; selectedSort: string; preserved?: PreservedValue[] }) {
  return <span className="status-column-filter"><span>Submitted</span><details className="status-column-menu"><summary aria-label="Filter submitted date"><ListFilter size={14} strokeWidth={2.4} /></summary><form action={action} className="status-column-menu-panel">{preserved.filter((item) => item.value).map((item) => <input key={item.name} type="hidden" name={item.name} value={item.value!} />)}<fieldset><legend>Submitted date</legend><label>Date<input name="date" type="date" defaultValue={selectedDate || ""} /></label></fieldset><fieldset><legend>Sort</legend><label><input type="radio" name="sort" value="submitted_at:desc" defaultChecked={selectedSort === "submitted_at:desc"} />Newest first</label><label><input type="radio" name="sort" value="submitted_at:asc" defaultChecked={selectedSort === "submitted_at:asc"} />Oldest first</label></fieldset><button className="button button-compact" type="submit">Apply</button></form></details></span>;
}

export function TimelineDateColumnFilter({ label, action, name, selectedDate, preserved = [] }: { label: string; action: string; name: string; selectedDate?: string; preserved?: PreservedValue[] }) {
  return <span className="status-column-filter"><span>{label}</span><details className="status-column-menu"><summary aria-label={`Filter ${label.toLowerCase()} date`}><ListFilter size={14} strokeWidth={2.4} /></summary><form action={action} className="status-column-menu-panel">{preserved.filter((item) => item.value).map((item) => <input key={item.name} type="hidden" name={item.name} value={item.value!} />)}<fieldset><legend>{label} date</legend><label>Date<input name={name} type="date" defaultValue={selectedDate || ""} /></label></fieldset><button className="button button-compact" type="submit">Apply</button></form></details></span>;
}
