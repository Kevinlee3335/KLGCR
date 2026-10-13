"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, RotateCcw } from "lucide-react";
import "./ai-assistant.css";
type Message = { role: "user" | "assistant"; text: string; capturedAt?: string };
type Usage = { reservedMyr: number; budgetMyr: number; requests?: number; tokens?: number };
const prompts = ["总结目前投诉和维修工作的重点", "哪些库存需要补货？", "分析员工任务分配与完成情况", "今天 Daily Task 有什么需要跟进？"];
export default function AiAssistantClient() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [coverage, setCoverage] = useState<{ table: string; loaded: number; visibleTotal: number; truncated: boolean; detailCount: number }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  useEffect(() => { fetch("/api/ai-assistant", { cache: "no-store" }).then(async res => { const data = await res.json(); if (res.ok) setUsage(data); else setError(data.error); }).catch(() => setError("Unable to load usage.")); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q || lock.current) return;
    lock.current = true; setError(""); setBusy(true);
    const history = messages.slice(-8).map(({ role, text }) => ({ role, text: text.slice(0, 6000) }));
    try {
      const res = await fetch("/api/ai-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages(prev => [...prev, { role: "user", text: q }, { role: "assistant", text: data.answer, capturedAt: data.capturedAt }]);
      setUsage(data.usage); setCoverage(data.sources); setQuestion("");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className="ai-workspace">
    <header className="ai-header"><div className="ai-brand"><div className="ai-icon"><Sparkles size={26}/></div><div><h1>KLGCR AI Assistant <span>V1.0 TEST</span></h1><p>Operations insights · Complaint / Jobs / Daily Task / Inventory</p></div></div><button className="ai-clear" onClick={() => { setMessages([]); setCoverage([]); setError(""); }} disabled={busy}><RotateCcw size={15}/> New chat</button></header>
    <div className="ai-info"><span>Read-only · Admin & Management</span><span>{usage ? `Budget reserved RM${Number(usage.reservedMyr).toFixed(2)} / RM20` : "Loading budget…"}</span></div>
    <p className="ai-budget-note">Each request reserves RM0.50 conservatively, including failures. Stops before RM20. This is a test allowance, not the Google invoice. Chats stay in this tab.</p>
    <section className="ai-conversation" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
      {!messages.length && <div className="ai-welcome"><Bot size={42}/><h2>What needs your attention today?</h2><p>Ask about current work, stock levels or staff workload. Answers use records your account can read.</p><div className="ai-prompts">{prompts.map(prompt => <button disabled={busy} key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<span>↗</span></button>)}</div></div>}
      {messages.map((message, index) => <article key={index} className={`ai-message ${message.role}`}><strong>{message.role === "user" ? "You" : "KLGCR Assistant"}</strong><p>{message.text}</p>{message.capturedAt && <small>Data snapshot: {new Date(message.capturedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT</small>}</article>)}
      {busy && <div className="ai-thinking" role="status">Reading current records and preparing analysis…</div>}<div ref={bottom}/>
    </section>
    {coverage.length > 0 && <details className="ai-coverage"><summary>Data coverage</summary>{coverage.map(source => <p key={source.table}>{source.table}: {source.loaded} / {source.visibleTotal} visible records · {source.detailCount} detail records {source.truncated ? "— partial dataset" : "— all visible records"}</p>)}</details>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    <form onSubmit={ask} className="ai-compose"><textarea aria-label="Ask AI" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1500} rows={2} placeholder="Ask about a room, outstanding jobs or inventory…" disabled={busy}/><button disabled={busy || !question.trim() || Number(usage?.reservedMyr) >= 20} type="submit"><Send size={18}/><span>{busy ? "Thinking…" : "Send"}</span></button></form>
    <footer className="ai-footer">AI suggestions need your review. No records are changed. Summary: up to 500 work records / 1000 inventory items. Details: up to 80, prioritising room/item codes. Coverage shown with each analysis.</footer>
  </main>;
}
