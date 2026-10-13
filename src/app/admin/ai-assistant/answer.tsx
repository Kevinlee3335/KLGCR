import { Fragment, type ReactNode } from "react";
// Render a small Markdown subset as React text nodes; never execute HTML or model links.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2,-2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1,-1)}</code> : part.startsWith("*") && part.endsWith("*") ? <em key={index}>{part.slice(1,-1)}</em> : <Fragment key={index}>{part}</Fragment>);
}
export function AiAnswer({ text }: { text: string }) {
  const lines = text.split("\n"); const elements: ReactNode[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim(); if (!line) continue;
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
