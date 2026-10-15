"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Send, Sparkles, RotateCcw } from "lucide-react";
import "./ai-assistant.css";
import { AiAnswer } from "./answer";
type Message = { role: "user" | "assistant"; text: string; capturedAt?: string };
type Conversation = { id: string; title: string; updated_at: string };
type Turn = { question: string; answer: string; captured_at: string };
type Usage = { reservedMyr: number; budgetMyr: number; requests?: number; tokens?: number };
const prompts = ["Summarise outstanding complaints and jobs", "Which inventory items need restocking?", "Review staff workload and task completion", "Which Daily Tasks need attention today?"];
export default function AiAssistantClient() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [moreChats, setMoreChats] = useState(false);
  const [moreTurns, setMoreTurns] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [coverage, setCoverage] = useState<{ table: string; loaded: number; visibleTotal: number; truncated: boolean; detailCount: number }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  useEffect(() => { fetch("/api/ai-assistant", { cache: "no-store" }).then(async res => { const data = await res.json(); if (res.ok) setUsage(data); else setError(data.error); }).catch(() => setError("Unable to load usage.")); }, []);
  async function historyJson(query = "") {
    const res = await fetch(`/api/ai-assistant/history${query}`, { cache: "no-store" });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || "Unable to load chat history."); return data;
  }
  function turnMessages(turns: Turn[]): Message[] { return turns.flatMap(turn => [{ role: "user" as const, text: turn.question }, { role: "assistant" as const, text: turn.answer, capturedAt: turn.captured_at }]); }
  async function refreshChats(offset = 0) {
    const data = await historyJson(`?offset=${offset}`); const rows: Conversation[] = data.conversations;
    setConversations(prev => offset ? [...prev, ...rows] : rows); setMoreChats(rows.length === 25); return rows;
  }
  async function openChat(id: string, earlier = false) {
    if (lock.current) return;
    lock.current = true; setLoadingHistory(true); setError("");
    try {
      const data = await historyJson(`?conversationId=${id}&offset=${earlier ? turnCount : 0}`);
      const turns: Turn[] = data.turns;
      setMessages(prev => earlier ? [...turnMessages(turns), ...prev] : turnMessages(turns));
      setConversationId(id); setTurnCount(prev => earlier ? prev + turns.length : turns.length); setMoreTurns(turns.length === 25); setCoverage([]);
      if (!earlier) setQuestion("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load chat."); }
    finally { lock.current = false; setLoadingHistory(false); }
  }
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        const data = await historyJson(); if (cancelled) return;
        const rows: Conversation[] = data.conversations; setConversations(rows); setMoreChats(rows.length === 25);
        if (rows[0]) {
          const chat = await historyJson(`?conversationId=${rows[0].id}`); if (cancelled) return;
          setConversationId(rows[0].id); setMessages(turnMessages(chat.turns)); setTurnCount(chat.turns.length); setMoreTurns(chat.turns.length === 25);
        }
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "Unable to restore history."); }
      finally { if (!cancelled) setLoadingHistory(false); }
    }
    void restore(); return () => { cancelled = true; };
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q || lock.current || loadingHistory) return;
    lock.current = true; setError(""); setBusy(true);
    const history = messages.slice(-8).map(({ role, text }) => ({ role, text: text.slice(0, 6000) }));
    try {
      const res = await fetch("/api/ai-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, history, conversationId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages(prev => [...prev, { role: "user", text: q }, { role: "assistant", text: data.answer, capturedAt: data.capturedAt }]);
      setConversationId(data.conversationId); setTurnCount(prev => prev + 1);
      if (!data.historySaved) setError("This answer could not be saved. Keep this page open and copy it before leaving.");
      try { await refreshChats(); } catch { if (data.historySaved) setError("Answer saved, but the history list could not refresh. Please reload later."); }
      setUsage(data.usage); setCoverage(data.sources); setQuestion("");
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <main className="ai-workspace">
    <header className="ai-header"><div className="ai-brand"><div className="ai-icon"><Sparkles size={26}/></div><div><h1>KLGCR AI Assistant <span>V1.0</span></h1><p>Operations insights · Complaint / Jobs / Daily Task / Inventory / Material Usage</p></div></div><button className="ai-clear" onClick={() => { setMessages([]); setCoverage([]); setError(""); setConversationId(undefined); setQuestion(""); setMoreTurns(false); setTurnCount(0); }} disabled={busy || loadingHistory}><RotateCcw size={15}/> New chat</button></header>
    <div className="ai-info"><span>Read-only · Admin & Management</span><span>{usage ? `Safety allowance: ${Math.max(0, 40 - Math.ceil(Number(usage.reservedMyr) * 2))} requests remaining` : "Loading budget…"}</span></div>
    <p className="ai-budget-note">This counter is a safety limit, not a bill. It includes failed attempts. Provider billing depends on your Google API plan. Chats are saved to your account. Historical answers retain their original snapshot time.</p>
    <details className="ai-history" open><summary>Chat history · Only visible to you</summary><div className="ai-history-list">
      {loadingHistory && <p role="status">Loading saved chats…</p>}
      {!loadingHistory && !conversations.length && <p>No saved chats yet.</p>}
      {conversations.map(chat => <button type="button" key={chat.id} disabled={busy || loadingHistory} aria-pressed={conversationId === chat.id} onClick={() => void openChat(chat.id)}><span>{chat.title}</span><small>{new Date(chat.updated_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</small></button>)}
      {moreChats && <button type="button" disabled={busy || loadingHistory} onClick={async () => { setLoadingHistory(true); try { await refreshChats(conversations.length); } catch { setError("Unable to load more chats."); } finally { setLoadingHistory(false); } }}>Load more chats</button>}
    </div></details>
    <section className="ai-conversation" aria-label="Conversation" aria-live="polite" aria-busy={busy}>
      {moreTurns && conversationId && <button type="button" disabled={busy || loadingHistory} onClick={() => void openChat(conversationId,true)}>Load earlier messages</button>}
      {!loadingHistory && !messages.length && <div className="ai-welcome"><Bot size={42}/><h2>What needs your attention today?</h2><p>Ask about current work, stock levels or staff workload. Answers use records your account can read.</p><div className="ai-prompts">{prompts.map(prompt => <button disabled={busy || loadingHistory} key={prompt} onClick={() => setQuestion(prompt)}>{prompt}<span>↗</span></button>)}</div></div>}
      {messages.map((message, index) => <article key={index} className={`ai-message ${message.role}`}><strong>{message.role === "user" ? "You" : "KLGCR Assistant"}</strong>{message.role === "assistant" ? <AiAnswer text={message.text}/> : <p>{message.text}</p>}{message.capturedAt && <small>Data snapshot: {new Date(message.capturedAt).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} MYT</small>}</article>)}
      {busy && <div className="ai-thinking" role="status">Reading current records and preparing analysis…</div>}<div ref={bottom}/>
    </section>
    {coverage.length > 0 && <details className="ai-coverage"><summary>Data coverage</summary>{coverage.map(source => <p key={source.table}>{source.table}: {source.loaded} / {source.visibleTotal} visible records · {source.detailCount} detail records {source.truncated ? "— partial dataset" : "— all visible records"}</p>)}</details>}
    {error && <p className="ai-error" role="alert">{error}</p>}
    <form onSubmit={ask} className="ai-compose"><textarea aria-label="Ask AI" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1500} rows={2} placeholder="Ask about a room, outstanding jobs or inventory…" disabled={busy || loadingHistory}/><button disabled={busy || loadingHistory || !question.trim() || Number(usage?.reservedMyr) >= 20} type="submit"><Send size={18}/><span>{busy ? "Thinking…" : "Send"}</span></button></form>
    <footer className="ai-footer">AI suggestions need your review. No records are changed. Summary: up to 500 work records / 1000 inventory items. Details: up to 80, prioritising room/item codes. Coverage shown with each analysis.</footer>
  </main>;
}
