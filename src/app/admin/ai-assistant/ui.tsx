"use client";
import { useState } from "react";
type Message = { role: "user" | "assistant"; text: string };
export default function AiAssistantClient() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = question.trim();
    if (!q || busy) return;
    setQuestion(""); setError(""); setBusy(true);
    setMessages(prev => [...prev, { role: "user", text: q }]);
    try {
      const res = await fetch("/api/ai-assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages(prev => [...prev, { role: "assistant", text: data.answer }]);
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 880, margin: "30px auto", padding: 20 }}>
    <a href="/admin">← Dashboard</a>
    <h1 style={{ fontSize: 28, fontWeight: 700, marginTop: 16 }}>KLGCR AI Assistant</h1>
    <p style={{ margin: "12px 0", color: "#ad8c45" }}>TEST VERSION · General AI only. Company database analysis is not connected yet. Do not enter tenant or staff personal information.</p>
    <section aria-live="polite" style={{ display: "grid", gap: 12, margin: "24px 0" }}>
      {messages.length === 0 && <p>Ask a general maintenance or operations question to test Gemini.</p>}
      {messages.map((m, i) => <div key={i} style={{ padding: 14, border: "1px solid #8885", borderRadius: 12, whiteSpace: "pre-wrap" }}><strong>{m.role === "user" ? "You" : "AI Assistant"}</strong><p style={{ marginTop: 8 }}>{m.text}</p></div>)}
    </section>
    {error && <p role="alert" style={{ color: "#d45" }}>{error}</p>}
    <form onSubmit={ask} style={{ display: "flex", gap: 8 }}>
      <input aria-label="Ask AI" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1500} placeholder="Ask AI anything..." style={{ flex: 1, minWidth: 0, padding: 12, border: "1px solid #888", borderRadius: 8, color: "inherit", background: "transparent" }} />
      <button disabled={busy || !question.trim()} type="submit" style={{ padding: "12px 20px", borderRadius: 8, background: "#c4a45c", color: "#111" }}>{busy ? "Thinking..." : "Ask"}</button>
    </form>
  </main>;
}
