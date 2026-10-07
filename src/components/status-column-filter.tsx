import { ListFilter } from "lucide-react";

type Option = { value: string; label: string };
type PreservedValue = { name: string; value?: string | null };

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
