import { Fragment, type ReactNode } from "react";
// Render a small Markdown subset as React text nodes; never execute HTML or model links.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2,-2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1,-1)}</code> : part.startsWith("*") && part.endsWith("*") ? <em key={index}>{part.slice(1,-1)}</em> : <Fragment key={index}>{part}</Fragment>);
}
export function AiAnswer({ text }: { text: string }) {
  const lines = text.replace(/\\\|/g, "|").split("\n"); const elements: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim(); if (!line) continue;
    const cells = (value: string) => value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
    let divider = index + 1;
    while (divider < lines.length && !lines[divider].trim()) divider++;
    if (line.startsWith("|") && divider < lines.length && cells(lines[divider]).every(cell => /^:?-{3,}:?$/.test(cell))) {
      const start = index; const headers = cells(line); const rows: string[][] = []; index = divider;
      while (index + 1 < lines.length) {
        if (!lines[index + 1].trim()) { let next = index + 2; while (next < lines.length && !lines[next].trim()) next++; if (!lines[next]?.trim().startsWith("|")) break; index = next - 1; }
        if (!lines[index + 1]?.trim().startsWith("|")) break;
        rows.push(cells(lines[++index]));
      }
      elements.push(<div className="ai-table-scroll" key={start} tabIndex={0} role="region" aria-label="Analysis table"><table><thead><tr>{headers.map((cell, i) => <th scope="col" key={i}>{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j}>{inline(row[j] ?? "")}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) { elements.push(<h3 key={index}>{inline(heading[1])}</h3>); continue; }
    if (/^[-*]\s+/.test(line)) {
      const items = []; const start = index;
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) { items.push(<li key={index}>{inline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>); index++; }
      index--; elements.push(<ul key={start}>{items}</ul>); continue;
    }
    elements.push(<p key={index}>{inline(line)}</p>);
  }
  return <div className="ai-answer">{elements}</div>;
}
